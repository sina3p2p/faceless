/**
 * generate-frame-videos:audio-lipsync — Seedance 2 movie pipeline stage.
 *
 * Speaking closeup frames use Seedance's reference mode:
 *   reference_images[0] = frame's generated still (character appearance + scene context)
 *   reference_audios[0] = scene's TTS audio (drives native lipsync)
 *   duration = scene audio duration (clamped to model's valid range)
 *   No start/end frame images — incompatible with reference mode.
 *
 * Non-speaking frames use standard image-to-video with Seedance noise preprocessing,
 * identical to the default generate-frame-videos stage.
 */

import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { WORKER, VIDEO_MODELS } from "@/lib/constants";
import {
  generateVideoFromImage,
  generateVideoFromReferences,
  type VideoResult,
} from "@/server/services/ai/video";
import {
  SEEDANCE2_MODELS,
  isE005,
  addSeedanceNoise,
  addSeedanceNoiseEnhanced,
} from "@/server/services/ai/video/seedance-noise";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { and, isNotNull } from "drizzle-orm";
import { pickBestDuration } from "@/server/services/ai/video/pick-duration";

const SPEAKING_PROMPT_TEMPLATE = (motion: string) =>
  `[Image1] speaks the dialogue from [Audio1] with natural lip movements and facial expressions. ${motion}`.trim();

export async function generateFrameVideosAudioLipsyncJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

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

    const targets = timeline.filter((f) => !f.videoMediaId && f.imageMediaId);

    const videoModelId = videoProject.modelSettings.videoModel;
    const aspectRatio = videoProject.videoSize;
    const videoResolution = videoProject.videoResolution;
    const validDurations = VIDEO_MODELS[videoModelId]?.durations ?? [5];

    const indexById = new Map(timeline.map((f, i) => [f.id, i] as const));

    console.log(
      `[generate-frame-videos:audio-lipsync] Generating ${targets.length} clips (model=${videoModelId})`
    );

    const BATCH_SIZE = WORKER.parallelVideos;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frame) => {
          try {
            const imageSignedUrl = mediaUrl(frame.imageMedia!.url);
            const motionDescription =
              frame.visualDescription || "Cinematic motion, smooth camera movement.";
            const frameIdx = indexById.get(frame.id);

            const isSpeakingFrame =
              frame.isSpeakingCloseup === true && !!frame.scene?.audioUrl;
            const sceneAudioUrl = isSpeakingFrame ? frame.scene!.audioUrl! : null;
            const sceneAudioDuration = isSpeakingFrame ? (frame.scene!.duration ?? 5) : null;

            let videoResult: VideoResult;

            if (isSpeakingFrame && sceneAudioUrl) {
              // Reference mode: character image + TTS audio → native lipsync.
              // Apply Seedance noise to the reference image to avoid E005 moderation.
              let refImageUrl = imageSignedUrl;
              if (SEEDANCE2_MODELS.has(videoModelId)) {
                try {
                  refImageUrl = await addSeedanceNoise(imageSignedUrl, frame.id, videoProjectId);
                } catch {
                  // fall back to original
                }
              }

              const clampedDuration = pickBestDuration(sceneAudioDuration!, validDurations);
              const prompt = SPEAKING_PROMPT_TEMPLATE(motionDescription);

              const callRef = (imgUrl: string) =>
                generateVideoFromReferences(
                  [imgUrl],
                  [mediaUrl(sceneAudioUrl)],
                  prompt,
                  videoModelId,
                  aspectRatio,
                  videoResolution,
                  clampedDuration
                );

              try {
                videoResult = await callRef(refImageUrl);
              } catch (err) {
                if (SEEDANCE2_MODELS.has(videoModelId) && isE005(err)) {
                  console.warn(
                    `[generate-frame-videos:audio-lipsync] Frame ${frame.id}: E005 — retrying with enhanced noise`
                  );
                  try {
                    const enhanced = await addSeedanceNoiseEnhanced(
                      imageSignedUrl,
                      frame.id,
                      videoProjectId
                    );
                    videoResult = await callRef(enhanced);
                  } catch {
                    videoResult = await callRef(imageSignedUrl);
                  }
                } else {
                  throw err;
                }
              }

              // Use scene audio duration as the effective clip duration so the
              // composer allocates the right time slice for this frame.
              const effectiveDuration = sceneAudioDuration!;

              const videoResp = await fetch(videoResult.videoUrl);
              if (!videoResp.ok) throw new Error("Failed to download lipsync video");
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const key = `frames/${videoProjectId}/video_${frame.id}_${Date.now()}.mp4`;
              await uploadFile(key, videoBuffer, "video/mp4");

              const [newMedia] = await db
                .insert(schema.media)
                .values({
                  userId: videoProject.userId,
                  frameId: frame.id,
                  type: "video",
                  url: key,
                  prompt: motionDescription,
                  modelUsed: videoModelId,
                  metadata: { nativeLipSync: true },
                })
                .returning();

              await db
                .update(schema.sceneFrames)
                .set({ videoMediaId: newMedia.id, clipDuration: effectiveDuration })
                .where(eq(schema.sceneFrames.id, frame.id));

              console.log(
                `[generate-frame-videos:audio-lipsync] Frame ${frame.id}: lipsync clip saved (${effectiveDuration}s)`
              );
            } else {
              // Standard i2v for non-speaking frames — same as default stage.
              const desiredDuration = frame.clipDuration;
              const endFramePolicy = frame.motionSpec?.endFramePolicy ?? "anchor";
              let endImageUrl: string | undefined;
              if (
                endFramePolicy === "anchor" &&
                frameIdx !== undefined &&
                frameIdx < timeline.length - 1
              ) {
                const next = timeline[frameIdx + 1];
                if (next?.imageMedia?.url) endImageUrl = mediaUrl(next.imageMedia.url);
              }

              let startUrl = imageSignedUrl;
              let endUrl = endImageUrl;
              if (SEEDANCE2_MODELS.has(videoModelId)) {
                try {
                  startUrl = await addSeedanceNoise(imageSignedUrl, frame.id, videoProjectId);
                  if (endImageUrl)
                    endUrl = await addSeedanceNoise(
                      endImageUrl,
                      `end_${frame.id}`,
                      videoProjectId
                    );
                } catch {
                  // fall back to originals
                }
              }

              const callGen = (s: string, e: string | undefined) =>
                generateVideoFromImage(
                  s,
                  motionDescription,
                  desiredDuration,
                  videoModelId,
                  videoProject.modelSettings.motionModel,
                  e,
                  aspectRatio,
                  videoResolution
                );

              try {
                videoResult = await callGen(startUrl, endUrl);
              } catch (err) {
                if (SEEDANCE2_MODELS.has(videoModelId) && isE005(err)) {
                  console.warn(
                    `[generate-frame-videos:audio-lipsync] Frame ${frame.id}: E005 — retrying with enhanced noise`
                  );
                  try {
                    const es = await addSeedanceNoiseEnhanced(
                      imageSignedUrl,
                      frame.id,
                      videoProjectId
                    );
                    const ee = endImageUrl
                      ? await addSeedanceNoiseEnhanced(
                          endImageUrl,
                          `end_${frame.id}`,
                          videoProjectId
                        )
                      : undefined;
                    videoResult = await callGen(es, ee);
                  } catch {
                    videoResult = await callGen(imageSignedUrl, endImageUrl);
                  }
                } else {
                  throw err;
                }
              }

              const videoResp = await fetch(videoResult.videoUrl);
              if (!videoResp.ok) throw new Error("Failed to download video");
              const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
              const key = `frames/${videoProjectId}/video_${frame.id}_${Date.now()}.mp4`;
              await uploadFile(key, videoBuffer, "video/mp4");

              const [newMedia] = await db
                .insert(schema.media)
                .values({
                  userId: videoProject.userId,
                  frameId: frame.id,
                  type: "video",
                  url: key,
                  prompt: motionDescription,
                  modelUsed: videoModelId,
                })
                .returning();

              await db
                .update(schema.sceneFrames)
                .set({ videoMediaId: newMedia.id })
                .where(eq(schema.sceneFrames.id, frame.id));
            }
          } catch (err) {
            console.error(
              `[generate-frame-videos:audio-lipsync] Frame ${frame.id} failed:`,
              err instanceof Error ? err.message : err
            );
          }
        })
      );

      if (targets.length > 0) {
        await job.updateProgress(Math.round(((i + batch.length) / targets.length) * 100));
      }
    }

    const updatedFrames = await db.query.sceneFrames.findMany({
      where: and(
        eq(schema.sceneFrames.videoProjectId, videoProjectId),
        isNotNull(schema.sceneFrames.videoMediaId)
      ),
      columns: { videoMediaId: true },
    });

    console.log(
      `[generate-frame-videos:audio-lipsync] ${updatedFrames.length}/${timeline.length} clips generated`
    );
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-videos:audio-lipsync] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
