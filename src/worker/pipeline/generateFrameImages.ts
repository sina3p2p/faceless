import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, resolveStoryAssets, filterAssetsByRefs, failJob } from "../shared";
import { getVideoSize } from "@/lib/constants";
import type { RenderJobData } from "@/lib/queue";
import { serializeCanonicalForImageProvider } from "@/server/services/llm/prompt-contract";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { generateImage, type AspectRatio } from "@/server/services/media";
import { autoChainOrReview } from "./shared";

export async function generateFrameImagesJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      with: {
        series: { columns: { imageModel: true, videoSize: true, storyAssets: true, characterImages: true } },
      },
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "IMAGE_GENERATION");

    const imageModel = videoProject.imageModel;
    const sizeConfig = getVideoSize(videoProject.videoSize);
    const ar = sizeConfig.id as AspectRatio;

    const allAssets = await resolveStoryAssets(
      videoProject.series?.storyAssets as Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string; sheetUrl?: string }> | null,
      videoProject.series?.characterImages as Array<{ url: string; description: string }> | null
    );

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
      await autoChainOrReview(videoProjectId, userId, "REVIEW_IMAGES", "generate-pipeline-motion");
      return;
    }

    console.log(`[generate-frame-images] Generating ${targets.length} images sequentially with chain-referencing, ${imageModel}, ${allAssets.length} story assets`);

    let previousFrameSignedUrl: string | null = null;

    const firstTargetIdx = allFrames.findIndex(({ frame }) => frame.id === targets[0].frame.id);
    if (firstTargetIdx > 0) {
      const prevFrame = allFrames[firstTargetIdx - 1].frame;
      if (prevFrame.imageMedia?.url) {
        try { previousFrameSignedUrl = await getSignedDownloadUrl(prevFrame.imageMedia.url); } catch { /* skip */ }
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const { frame, sceneIdx } = targets[i];
      const canonicalPrompt = frame.imagePrompt || `Scene ${sceneIdx + 1}`;
      const { providerPrompt: prompt } = serializeCanonicalForImageProvider(canonicalPrompt);
      const frameAssetRefs = frame.assetRefs as string[] | null;
      const matchedAssets = filterAssetsByRefs(allAssets, frameAssetRefs);

      const sceneRefs = matchedAssets.map((a) => ({
        ...a,
        url: a.sheetUrl || a.url,
      }));

      if (previousFrameSignedUrl) {
        sceneRefs.push({
          id: "prev-frame",
          type: "character" as const,
          name: "previous_frame",
          description: "Previous frame — maintain visual consistency, same characters and style",
          url: previousFrameSignedUrl,
        });
      }

      try {
        const result = await generateImage(prompt, imageModel!, sceneRefs, ar);

        const imgResp = await fetch(result.url);
        if (!imgResp.ok) throw new Error("Failed to download generated image");
        const buffer = Buffer.from(await imgResp.arrayBuffer());

        const key = `frames/${videoProjectId}/frame_${frame.id}_${Date.now()}.jpg`;
        await uploadFile(key, buffer, "image/jpeg");

        const [newMedia] = await db.insert(schema.media).values({
          frameId: frame.id,
          type: "image",
          url: key,
          prompt,
          modelUsed: imageModel,
        }).returning();

        await db
          .update(schema.sceneFrames)
          .set({ imageMediaId: newMedia.id, modelUsed: imageModel })
          .where(eq(schema.sceneFrames.id, frame.id));

        previousFrameSignedUrl = await getSignedDownloadUrl(key);

        console.log(`[generate-frame-images] Frame ${i + 1}/${targets.length} (scene ${sceneIdx}) done`);
      } catch (err) {
        console.error(`[generate-frame-images] Frame ${frame.id} failed:`, err);
      }

      const progress = Math.round(((i + 1) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    console.log(`[generate-frame-images] All ${targets.length} images generated`);

    await autoChainOrReview(videoProjectId, userId, "REVIEW_IMAGES", "generate-pipeline-motion");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-images] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
