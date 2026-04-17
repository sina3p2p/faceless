import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { WORKER } from "@/lib/constants";
import { getAIVideoForScene } from "@/server/services/ai/video";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { autoChainOrReview } from "./shared";

export async function generateFrameVideosJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "VIDEO_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    type FrameWithMedia = typeof schema.sceneFrames.$inferSelect & { imageMedia: typeof schema.media.$inferSelect | null };
    const allFrames: Array<{ frame: FrameWithMedia; sceneIdx: number }> = [];
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

    const targets = allFrames.filter(({ frame }) => !frame.videoMediaId && frame.imageMediaId);

    console.log(`[generate-frame-videos] Generating ${targets.length} video clips`);

    const videoModelKey = seriesRecord.videoModel || undefined;
    const BATCH_SIZE = WORKER.parallelVideos;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async ({ frame, sceneIdx }) => {
          try {
            const imageSignedUrl = await getSignedDownloadUrl(frame.imageMedia!.url);
            const videoPrompt = frame.visualDescription
              || `Cinematic motion, smooth camera movement.`;
            const desiredDuration = Math.max(3, Math.round(frame.clipDuration ?? 5));

            console.log(`[generate-frame-videos] Frame ${frame.id} (scene ${sceneIdx}): ${desiredDuration}s clip`);

            const videoResult = await getAIVideoForScene(imageSignedUrl, videoPrompt, desiredDuration, videoModelKey);

            const videoResp = await fetch(videoResult.videoUrl);
            if (!videoResp.ok) throw new Error("Failed to download video");
            const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

            const key = `frames/${videoProjectId}/video_${frame.id}_${Date.now()}.mp4`;
            await uploadFile(key, videoBuffer, "video/mp4");

            const [newMedia] = await db.insert(schema.media).values({
              frameId: frame.id,
              type: "video",
              url: key,
              prompt: videoPrompt,
              modelUsed: videoModelKey || "kling-3-standard",
            }).returning();

            await db
              .update(schema.sceneFrames)
              .set({ videoMediaId: newMedia.id })
              .where(eq(schema.sceneFrames.id, frame.id));
          } catch (err) {
            console.error(`[generate-frame-videos] Frame ${frame.id} (scene ${sceneIdx}) failed:`, err instanceof Error ? err.message : err);
          }
        })
      );

      const progress = Math.round(((i + batch.length) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    const updatedFrames = await Promise.all(
      targets.map(async ({ frame }) => {
        const f = await db.query.sceneFrames.findFirst({ where: eq(schema.sceneFrames.id, frame.id), columns: { videoMediaId: true } });
        return !!f?.videoMediaId;
      })
    );
    const succeeded = updatedFrames.filter(Boolean).length;
    const failed = targets.length - succeeded;

    console.log(`[generate-frame-videos] ${succeeded}/${targets.length} clips generated${failed > 0 ? ` (${failed} failed — content moderation or other error)` : ""}`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_PRODUCTION", "compose-final");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-videos] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
