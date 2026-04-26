import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getVideoSize, VIDEO_I2V_PROVIDER, WORKER } from "@/lib/constants";
import { getAIVideoForScene } from "@/server/services/ai/video";
import { resolveModel } from "@/server/services/ai/video/resolve-model";
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

    const rawFrames = await db.query.sceneFrames.findMany({
      where: eq(schema.sceneFrames.videoProjectId, videoProjectId),
      with: { imageMedia: true, scene: true },
    });

    const timeline = [...rawFrames].sort((a, b) => {
      const sa = a.scene?.sceneOrder ?? 0;
      const sb = b.scene?.sceneOrder ?? 0;
      if (sa !== sb) return sa - sb;
      return a.frameOrder - b.frameOrder;
    });

    const targets = timeline.filter((frame) => !frame.videoMediaId && frame.imageMediaId);

    const useContinuity = !!videoProject.sceneContinuity;
    const videoModelKey = videoProject.videoModel || undefined;
    const { endFrame: modelSupportsEndFrame } = resolveModel(videoModelKey);
    const aspectRatio = getVideoSize(videoProject.videoSize).id;

    const indexById = new Map(timeline.map((f, i) => [f.id, i] as const));

    console.log(
      `[generate-frame-videos] Generating ${targets.length} video clips (continuity=${useContinuity ? "on" : "off"}, endFrame support=${modelSupportsEndFrame ? "yes" : "no"})`
    );

    /** Replicate: run one i2v at a time; create requests are also serialized+retried in the Replicate client. */
    const BATCH_SIZE = VIDEO_I2V_PROVIDER === "replicate" ? 1 : WORKER.parallelVideos;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frame) => {
          try {
            const imageSignedUrl = await getSignedDownloadUrl(frame.imageMedia!.url);
            const videoPrompt = frame.visualDescription
              || `Cinematic motion, smooth camera movement.`;
            const desiredDuration = frame.clipDuration;
            const frameIdx = indexById.get(frame.id);

            let endImageUrl: string | undefined = undefined;
            if (
              useContinuity
              && modelSupportsEndFrame
              && frameIdx !== undefined
              && frameIdx < timeline.length - 1
            ) {
              const next = timeline[frameIdx + 1];
              if (next?.imageMedia?.url) {
                endImageUrl = await getSignedDownloadUrl(next.imageMedia.url);
              }
            }

            if (endImageUrl && frameIdx !== undefined) {
              console.log(
                `[generate-frame-videos] Frame ${frame.id}: ${desiredDuration}s clip → next frame ${timeline[frameIdx + 1]!.id}`
              );
            } else {
              console.log(`[generate-frame-videos] Frame ${frame.id}: ${desiredDuration}s clip`);
            }

            const videoResult = await getAIVideoForScene(
              imageSignedUrl,
              videoPrompt,
              desiredDuration,
              videoModelKey,
              endImageUrl,
              aspectRatio
            );

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

      if (targets.length > 0) {
        const progress = Math.round(((i + batch.length) / targets.length) * 100);
        await job.updateProgress(progress);
      }
    }

    const updatedFrames = await db.query.sceneFrames.findMany({
      where: and(eq(schema.sceneFrames.videoProjectId, videoProjectId), isNotNull(schema.sceneFrames.videoMediaId)),
      columns: { videoMediaId: true },
    });

    const succeeded = updatedFrames.length;

    console.log(`[generate-frame-videos] ${succeeded}/${timeline.length} clips generated`);

    await autoChainOrReview(videoProjectId, userId, "REVIEW_PRODUCTION", "compose-final");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-videos] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
