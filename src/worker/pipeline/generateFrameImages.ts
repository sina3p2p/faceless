import { createHash } from "node:crypto";
import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, resolveStoryAssets, filterAssetsByRefs, failJob } from "../shared";
import { getVideoSize } from "@/lib/constants";
import type { RenderJobData } from "@/lib/queue";
import { serializeCanonicalForImageProvider } from "@/server/services/llm/prompt-contract";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { generateImage, type AspectRatio } from "@/server/services/media";
import {
  reviewFrameImage,
  type FrameMediaMetadata,
  type ReviewResult,
} from "@/server/services/llm/image-reviewer";
import { autoChainOrReview, getAgentModels, loadProjectConfig } from "./shared";

const SEVERITY_RANK: Record<"hard" | "soft", number> = { hard: 1, soft: 0 };

function clampRetries(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 3;
  return Math.min(3, Math.max(1, n));
}

function shouldRetry(verdict: ReviewResult, severityFloor: "hard" | "soft"): boolean {
  if (verdict.verdict !== "fail") return false;
  const floor = SEVERITY_RANK[severityFloor];
  return verdict.failures.some((f) => SEVERITY_RANK[f.severity] >= floor);
}

export async function generateFrameImagesJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "IMAGE_GENERATION");

    const imageModel = videoProject.modelSettings.imageModel;
    const sizeConfig = getVideoSize(videoProject.videoSize);
    const ar = sizeConfig.id as AspectRatio;

    const cfg = await loadProjectConfig(videoProjectId);
    const reviewEnabled = cfg.imageReviewEnabled !== false;
    const maxRetries = clampRetries(cfg.imageReviewMaxRetries);
    const severityFloor: "hard" | "soft" = cfg.imageReviewSeverityFloor ?? "hard";
    const reviewerModel = getAgentModels(videoProject).reviewerModel!;

    const allAssets = await resolveStoryAssets(videoProjectId);

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const allFrames: Array<{ frame: typeof schema.sceneFrames.$inferSelect & { imageMedia: typeof schema.media.$inferSelect | null }; sceneIdx: number }> = [];
    for (let i = 0; i < existingScenes.length; i++) {
      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, existingScenes[i].id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { imageMedia: true },
      });
      for (const frame of frames) {
        allFrames.push({ frame, sceneIdx: i });
      }
    }

    const targets = allFrames.filter(({ frame }) => !frame.imageMediaId);

    if (targets.length === 0) {
      console.log(`[generate-frame-images] All frames already have images`);
      await autoChainOrReview(videoProjectId, "REVIEW_IMAGES", "generate-pipeline-motion");
      return;
    }

    console.log(
      `[generate-frame-images] Generating ${targets.length} images sequentially with chain-referencing, ${imageModel}, ${allAssets.length} story assets, review=${reviewEnabled} maxRetries=${maxRetries}`
    );

    let previousFrameStorageKey: string | null = null;

    const firstTargetIdx = allFrames.findIndex(({ frame }) => frame.id === targets[0].frame.id);
    if (firstTargetIdx > 0) {
      const prevFrame = allFrames[firstTargetIdx - 1].frame;
      if (prevFrame.imageMedia?.url) {
        previousFrameStorageKey = prevFrame.imageMedia.url;
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const { frame, sceneIdx } = targets[i];
      const canonicalPrompt = frame.imagePrompt || `Scene ${sceneIdx + 1}`;
      const { providerPrompt: prompt } = serializeCanonicalForImageProvider(canonicalPrompt);
      const frameAssetRefs = frame.assetRefs as string[] | null;
      const matchedAssets = filterAssetsByRefs(allAssets, frameAssetRefs);

      const baseSceneRefs = matchedAssets.map((a) => ({
        ...a,
        url: a.sheetUrl || a.url,
      }));

      const priorHints: string[] = [];
      let acceptedMediaId: string | null = null;
      let acceptedStorageKey: string | null = null;
      let lastHash: string | null = null;
      let lastVerdict: ReviewResult | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const correctionSuffix = priorHints.length > 0
          ? "\n\nCorrection from prior attempts (must satisfy):\n" +
            priorHints.map((h, idx) => `  ${idx + 1}. ${h}`).join("\n")
          : "";
        const effectivePrompt = prompt + correctionSuffix;

        const sceneRefs = [...baseSceneRefs];
        if (previousFrameStorageKey) {
          sceneRefs.push({
            id: "prev-frame",
            type: "character" as const,
            name: "previous_frame",
            description: "Previous frame — maintain visual consistency, same characters and style",
            url: mediaUrl(previousFrameStorageKey),
          });
        }

        let buffer: Buffer;
        let storageKey: string;
        try {
          const result = await generateImage(effectivePrompt, imageModel!, sceneRefs, ar);
          const imgResp = await fetch(result.url);
          if (!imgResp.ok) throw new Error("Failed to download generated image");
          buffer = Buffer.from(await imgResp.arrayBuffer());
          storageKey = `frames/${videoProjectId}/frame_${frame.id}_${Date.now()}_a${attempt}.jpg`;
          await uploadFile(storageKey, buffer, "image/jpeg");
        } catch (err) {
          console.error(
            `[generate-frame-images] frame ${frame.id} attempt ${attempt}/${maxRetries} generation failed:`,
            err
          );
          if (attempt === maxRetries) break;
          continue;
        }

        const hash = createHash("sha256").update(buffer).digest("hex");

        const baseMetadata: FrameMediaMetadata = {
          reviewAttempt: attempt,
          sha256: hash,
          correctionHint: priorHints.at(-1),
        };

        const [attemptMedia] = await db
          .insert(schema.media)
          .values({
            userId: videoProject.userId,
            frameId: frame.id,
            type: "image",
            url: storageKey,
            prompt: effectivePrompt,
            modelUsed: imageModel,
            metadata: baseMetadata,
          })
          .returning();

        // Decide acceptance.
        if (!reviewEnabled) {
          await db
            .update(schema.media)
            .set({ metadata: { ...baseMetadata, reviewVerdict: "skipped" } satisfies FrameMediaMetadata })
            .where(eq(schema.media.id, attemptMedia.id));
          acceptedMediaId = attemptMedia.id;
          acceptedStorageKey = storageKey;
          console.log(
            `[generate-frame-images] frame ${i + 1}/${targets.length} (scene ${sceneIdx}) attempt ${attempt} accepted (review disabled)`
          );
          break;
        }

        let verdict: ReviewResult;
        if (lastHash !== null && lastHash === hash && lastVerdict) {
          // Identical regeneration — reuse prior verdict, skip another vision call.
          verdict = lastVerdict;
          console.log(
            `[generate-frame-images] frame ${frame.id} attempt ${attempt} hash matches prior; reusing verdict=${verdict.verdict}`
          );
        } else {
          try {
            verdict = await reviewFrameImage({
              imageUrl: storageKey,
              prevImageUrl: previousFrameStorageKey,
              prompt,
              assetRefs: frameAssetRefs,
              matchedAssets,
              aspectRatio: ar,
              attempt,
              priorHints,
              model: reviewerModel,
            });
          } catch (err) {
            // Reviewer error is fail-open: accept the image.
            console.warn(
              `[generate-frame-images] frame ${frame.id} attempt ${attempt} reviewer error — accepting image:`,
              err instanceof Error ? err.message : err
            );
            verdict = { verdict: "pass", failures: [], correction_hint: null };
          }
        }

        lastHash = hash;
        lastVerdict = verdict;

        const updatedMetadata: FrameMediaMetadata = {
          ...baseMetadata,
          reviewVerdict: verdict.verdict,
          reviewFailures: verdict.failures,
          reviewModel: reviewerModel,
        };
        await db
          .update(schema.media)
          .set({ metadata: updatedMetadata })
          .where(eq(schema.media.id, attemptMedia.id));

        const retry = shouldRetry(verdict, severityFloor) && attempt < maxRetries;
        console.log(
          `[generate-frame-images] frame ${i + 1}/${targets.length} (scene ${sceneIdx}) attempt ${attempt}/${maxRetries} verdict=${verdict.verdict} failures=${verdict.failures.length} ${retry ? "→ retry" : "→ accept"}`
        );

        if (!retry) {
          acceptedMediaId = attemptMedia.id;
          acceptedStorageKey = storageKey;
          break;
        }

        if (verdict.correction_hint) priorHints.push(verdict.correction_hint);
      }

      if (acceptedMediaId && acceptedStorageKey) {
        await db
          .update(schema.sceneFrames)
          .set({ imageMediaId: acceptedMediaId })
          .where(eq(schema.sceneFrames.id, frame.id));
        previousFrameStorageKey = acceptedStorageKey;
      } else {
        console.error(
          `[generate-frame-images] frame ${frame.id} produced no usable image after ${maxRetries} attempts; leaving frame without imageMediaId`
        );
      }

      const progress = Math.round(((i + 1) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    console.log(`[generate-frame-images] All ${targets.length} frames processed`);

    await autoChainOrReview(videoProjectId, "REVIEW_IMAGES", "generate-pipeline-motion");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-images] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
