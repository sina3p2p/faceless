import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { WORKER } from "@/lib/constants";
import { generateSingleFrameMotion } from "@/server/services/llm";
import { getSignedDownloadUrl } from "@/lib/storage";
import { getAgentModels, loadProjectConfig, autoChainOrReview } from "./shared";

export async function generateMotionJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "MOTION_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const allFrameData: Array<{
      frameId: string;
      clipDuration: number;
      sceneText: string;
      imageUrl: string;
    }> = [];

    for (let i = 0; i < existingScenes.length; i++) {
      const scene = existingScenes[i];
      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, scene.id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { imageMedia: true },
      });

      for (const frame of frames) {
        let signedUrl = "";
        if (frame.imageMedia?.url) {
          try {
            signedUrl = await getSignedDownloadUrl(frame.imageMedia.url);
          } catch { /* skip */ }
        }

        allFrameData.push({
          frameId: frame.id,
          clipDuration: frame.clipDuration ?? 5,
          sceneText: scene.text,
          imageUrl: signedUrl,
        });
      }
    }

    if (allFrameData.length === 0) {
      console.log(`[generate-motion] No frames found, skipping`);
      await renderQueue.add("generate-frame-videos", { videoProjectId, userId });
      return;
    }

    const config = await loadProjectConfig(videoProjectId);
    const styleGuide = config.visualStyleGuide;
    const frameBreakdown = config.frameBreakdown;

    const cameraPhysics = styleGuide?.global?.cameraPhysics ?? "";
    const materialLanguage = styleGuide?.global?.materialLanguage ?? "";

    const framesToProcess = allFrameData;

    console.log(`[generate-motion] Generating motion for ${framesToProcess.length} frames across ${existingScenes.length} scenes`);

    const agents = getAgentModels(videoProject);
    const BATCH_SIZE = WORKER.parallelImages;

    let globalFrameIdx = 0;
    const frameSpecMap: Map<number, { sceneIdx: number; frameIdx: number }> = new Map();
    for (let si = 0; si < existingScenes.length; si++) {
      const sceneFrameCount = (await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, existingScenes[si].id),
      })).length;
      for (let fi = 0; fi < sceneFrameCount; fi++) {
        frameSpecMap.set(globalFrameIdx++, { sceneIdx: si, frameIdx: fi });
      }
    }

    for (let i = 0; i < framesToProcess.length; i += BATCH_SIZE) {
      const batch = framesToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frameData, batchIdx) => {
          const globalIdx = i + batchIdx;
          const currentImageUrl = frameData.imageUrl;
          const nextImageUrl = globalIdx + 1 < allFrameData.length
            ? allFrameData[globalIdx + 1].imageUrl
            : null;

          if (!currentImageUrl) {
            console.warn(`[generate-motion] Frame ${frameData.frameId} has no image, skipping`);
            return;
          }

          const mapping = frameSpecMap.get(globalIdx);
          const frameSpec = mapping
            ? frameBreakdown?.scenes?.[mapping.sceneIdx]?.frames?.[mapping.frameIdx]
            : undefined;

          try {
            const result = await generateSingleFrameMotion(
              {
                clipDuration: frameData.clipDuration,
                motionPolicy: frameSpec?.motionPolicy ?? "moderate",
                transitionIn: frameSpec?.transitionIn ?? "cut",
                isLastFrame: globalIdx === allFrameData.length - 1,
                sceneText: frameData.sceneText,
                cameraPhysics,
                materialLanguage,
              },
              currentImageUrl,
              nextImageUrl,
              agents.motionModel
            );

            await db
              .update(schema.sceneFrames)
              .set({
                motionSpec: result.motionSpec,
                visualDescription: result.visualDescription,
              })
              .where(eq(schema.sceneFrames.id, frameData.frameId));

            console.log(`[generate-motion] Frame ${globalIdx + 1}/${framesToProcess.length} done`);
          } catch (err) {
            console.error(`[generate-motion] Frame ${frameData.frameId} failed:`, err instanceof Error ? err.message : err);
          }
        })
      );

      const progress = Math.round(((i + batch.length) / framesToProcess.length) * 100);
      await job.updateProgress(progress);
    }

    console.log(`[generate-motion] Motion descriptions ready`);

    await autoChainOrReview(videoProjectId, userId, "REVIEW_MOTION", "generate-frame-videos");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-motion] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
