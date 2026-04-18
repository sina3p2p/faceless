import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { WORKER } from "@/lib/constants";
import { getAIVideoForScene } from "@/server/services/ai/video";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { autoChainOrReview } from "./shared";
import { and, isNotNull } from "drizzle-orm";

export async function generateFrameVideosJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "VIDEO_GENERATION");

    const allFrames = await db.query.sceneFrames.findMany({
      where: eq(schema.sceneFrames.videoProjectId, videoProjectId),
      orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
      with: { imageMedia: true },
    });

    const targets = allFrames.filter((frame) => !frame.videoMediaId && frame.imageMediaId);

    console.log(`[generate-frame-videos] Generating ${targets.length} video clips`);

    const videoModelKey = videoProject.videoModel || undefined;
    const BATCH_SIZE = WORKER.parallelVideos;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frame) => {
          try {
            const imageSignedUrl = await getSignedDownloadUrl(frame.imageMedia!.url);
            const videoPrompt = frame.visualDescription
              || `Cinematic motion, smooth camera movement.`;
            const desiredDuration = Math.max(3, Math.round(frame.clipDuration ?? 5));

            console.log(`[generate-frame-videos] Frame ${frame.id}: ${desiredDuration}s clip`);

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
            console.error(`[generate-frame-videos] Frame ${frame.id} failed:`, err instanceof Error ? err.message : err);
          }
        })
      );

      const progress = Math.round(((i + batch.length) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    const updatedFrames = await db.query.sceneFrames.findMany({
      where: and(eq(schema.sceneFrames.videoProjectId, videoProjectId), isNotNull(schema.sceneFrames.videoMediaId)),
      columns: { videoMediaId: true },
    });

    const succeeded = updatedFrames.length;

    console.log(`[generate-frame-videos] ${succeeded}/${allFrames.length} clips generated`);

    await autoChainOrReview(videoProjectId, userId, "REVIEW_PRODUCTION", "compose-final");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-videos] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
