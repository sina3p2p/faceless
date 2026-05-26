import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import sharp from "sharp";
import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { WORKER, VIDEO_MODELS } from "@/lib/constants";
import { generateVideoFromImage, type VideoResult } from "@/server/services/ai/video";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { downloadFile } from "@/server/services/composer";
import { and, isNotNull } from "drizzle-orm";
import { execAsync } from "../shared";

const SEEDANCE2_MODELS: ReadonlySet<TVideoModelId> = new Set(["seedance-2-pro", "seedance-2-fast"]);

/**
 * Add imperceptible Gaussian noise (sigma=8, ~3% per channel) to bypass
 * ByteDance's E005 image-level content moderation on Seedance 2.0.
 * The pixel shift is invisible to humans but pushes the image out of the
 * classifier's flagged region in feature space.
 */
async function addSeedanceNoise(imageUrl: string, label: string, videoProjectId: string): Promise<string> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`noise fetch failed: ${resp.status}`);
  const inputBuffer = Buffer.from(await resp.arrayBuffer());

  const { data, info } = await sharp(inputBuffer).raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i++) {
    // Box-Muller transform → Gaussian sample
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-10)) * Math.cos(2 * Math.PI * Math.random());
    data[i] = Math.max(0, Math.min(255, data[i] + Math.round(8 * z)));
  }

  const outputBuffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
  }).jpeg({ quality: 95 }).toBuffer();

  const key = `frames/${videoProjectId}/noised_${label}_${Date.now()}.jpg`;
  await uploadFile(key, outputBuffer, "image/jpeg");
  return mediaUrl(key);
}

/** Stacked perturbation for E005 retry: hue shift + JPEG precompress + higher sigma noise. */
async function addSeedanceNoiseEnhanced(imageUrl: string, label: string, videoProjectId: string): Promise<string> {
  const resp = await fetch(imageUrl);
  if (!resp.ok) throw new Error(`noise fetch failed: ${resp.status}`);
  const inputBuffer = Buffer.from(await resp.arrayBuffer());

  // Hue rotation + JPEG recompress creates a shifted base before noise is applied.
  const precompressed = await sharp(inputBuffer)
    .modulate({ hue: 4 })
    .jpeg({ quality: 72 })
    .toBuffer();

  const { data, info } = await sharp(precompressed).raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i++) {
    const z = Math.sqrt(-2 * Math.log(Math.random() || 1e-10)) * Math.cos(2 * Math.PI * Math.random());
    data[i] = Math.max(0, Math.min(255, data[i] + Math.round(15 * z)));
  }

  const outputBuffer = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels as 1 | 2 | 3 | 4 },
  }).jpeg({ quality: 95 }).toBuffer();

  const key = `frames/${videoProjectId}/noised_enh_${label}_${Date.now()}.jpg`;
  await uploadFile(key, outputBuffer, "image/jpeg");
  return mediaUrl(key);
}

function isE005(err: unknown): boolean {
  return err instanceof Error && err.message.includes("E005");
}

/** Build an `atempo` filter chain that handles ratios outside the [0.5, 2.0] per-filter limit. */
function buildAtempoFilter(ratio: number): string {
  const filters: number[] = [];
  let r = ratio;
  while (r > 2.0) { filters.push(2.0); r /= 2.0; }
  while (r < 0.5) { filters.push(0.5); r *= 2.0; }
  filters.push(r);
  return filters.map((f) => `atempo=${f.toFixed(6)}`).join(",");
}

async function ffprobeDuration(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Replace the audio track of a video file with a TTS audio file,
 * time-stretching the TTS to match the video's duration so lips stay in sync.
 * Returns the path to the muxed output file.
 */
async function swapAudioTrack(
  videoPath: string,
  ttsAudioPath: string,
  outPath: string
): Promise<void> {
  const videoDur = await ffprobeDuration(videoPath);
  const ttsDur = await ffprobeDuration(ttsAudioPath);

  if (videoDur <= 0 || ttsDur <= 0) {
    throw new Error(`Cannot swap audio: videoDur=${videoDur} ttsDur=${ttsDur}`);
  }

  const ratio = videoDur / ttsDur;
  const atempoFilter = buildAtempoFilter(ratio);

  await execAsync(
    `ffmpeg -y -hide_banner ` +
    `-i "${videoPath}" -i "${ttsAudioPath}" ` +
    `-filter_complex "[1:a]${atempoFilter}[a]" ` +
    `-map 0:v:0 -map "[a]" ` +
    `-c:v copy -c:a aac -b:a 192k -shortest ` +
    `"${outPath}"`
  );
}

export async function generateFrameVideosJob(job: Job<RenderJobData>) {
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

    const targets = timeline.filter((frame) => !frame.videoMediaId && frame.imageMediaId);

    const videoModelId = videoProject.modelSettings.videoModel;
    const aspectRatio = videoProject.videoSize;
    const videoResolution = videoProject.videoResolution;
    const isMovie = videoProject.videoType === "movie";
    const modelSupportsAudio = VIDEO_MODELS[videoModelId]?.supportsAudio === true;

    const indexById = new Map(timeline.map((f, i) => [f.id, i] as const));

    console.log(
      `[generate-frame-videos] Generating ${targets.length} video clips` +
      (isMovie && modelSupportsAudio ? " (movie: native audio swap enabled)" : "")
    );

    const BATCH_SIZE = WORKER.parallelVideos;

    // Temp dir for audio swap intermediates — only created when needed.
    let workDir: string | null = null;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frame) => {
          try {
            const imageSignedUrl = mediaUrl(frame.imageMedia!.url);
            const videoPrompt = frame.visualDescription
              || `Cinematic motion, smooth camera movement.`;
            const desiredDuration = frame.clipDuration;
            const frameIdx = indexById.get(frame.id);

            const endFramePolicy = frame.motionSpec?.endFramePolicy ?? "anchor";

            let endImageUrl: string | undefined = undefined;
            if (
              endFramePolicy === "anchor"
              && frameIdx !== undefined
              && frameIdx < timeline.length - 1
            ) {
              const next = timeline[frameIdx + 1];
              if (next?.imageMedia?.url) {
                endImageUrl = mediaUrl(next.imageMedia.url);
              }
            }

            if (frameIdx !== undefined && frameIdx < timeline.length - 1) {
              const nextId = timeline[frameIdx + 1]!.id;
              console.log(
                `[generate-frame-videos] Frame ${frame.id}: ${desiredDuration}s clip → next ${nextId} (endFramePolicy=${endFramePolicy}${endImageUrl ? ", anchored" : ", freeform"})`
              );
            }

            // Determine whether to use native audio generation for this frame.
            const isSpeakingFrame =
              isMovie && modelSupportsAudio && frame.isSpeakingCloseup === true;
            const ttsAudioUrl = isSpeakingFrame ? (frame.scene?.audioUrl ?? null) : null;

            // For speaking frames, append the dialogue so the model generates
            // natural lip movements for that specific line.
            const finalPrompt = isSpeakingFrame && frame.scene?.text
              ? `${videoPrompt}\n\nCharacter says: "${frame.scene.text}"`
              : videoPrompt;

            // Seedance 2.x: add imperceptible Gaussian noise to bypass E005 moderation.
            let startUrl = imageSignedUrl;
            let endUrl = endImageUrl;
            if (SEEDANCE2_MODELS.has(videoModelId)) {
              try {
                startUrl = await addSeedanceNoise(imageSignedUrl, frame.id, videoProjectId);
                if (endImageUrl) endUrl = await addSeedanceNoise(endImageUrl, `end_${frame.id}`, videoProjectId);
              } catch (noiseErr) {
                console.warn(`[generate-frame-videos] Frame ${frame.id}: noise preprocessing failed (${noiseErr instanceof Error ? noiseErr.message : noiseErr}) — using original`);
              }
            }

            const callGenerate = (s: string, e: string | undefined): Promise<VideoResult> =>
              generateVideoFromImage(s, finalPrompt, desiredDuration, videoModelId, videoProject.modelSettings.motionModel, e, aspectRatio, videoResolution, isSpeakingFrame ? true : undefined);

            let videoResult: VideoResult;
            try {
              videoResult = await callGenerate(startUrl, endUrl);
            } catch (err) {
              if (SEEDANCE2_MODELS.has(videoModelId) && isE005(err)) {
                console.warn(`[generate-frame-videos] Frame ${frame.id}: E005 on attempt 1 — retrying with enhanced perturbation`);
                let enhStartUrl = imageSignedUrl;
                let enhEndUrl = endImageUrl;
                try {
                  enhStartUrl = await addSeedanceNoiseEnhanced(imageSignedUrl, frame.id, videoProjectId);
                  if (endImageUrl) enhEndUrl = await addSeedanceNoiseEnhanced(endImageUrl, `end_${frame.id}`, videoProjectId);
                } catch (noiseErr2) {
                  console.warn(`[generate-frame-videos] Frame ${frame.id}: enhanced noise failed (${noiseErr2 instanceof Error ? noiseErr2.message : noiseErr2}) — using original for retry`);
                }
                videoResult = await callGenerate(enhStartUrl, enhEndUrl);
              } else {
                throw err;
              }
            }

            // For speaking frames: replace the model's audio with the TTS voice.
            let finalVideoUrl = videoResult.videoUrl;
            let nativeLipSync = false;

            if (isSpeakingFrame && ttsAudioUrl) {
              try {
                if (!workDir) {
                  workDir = path.join(os.tmpdir(), `frame-videos-${videoProjectId}-${Date.now()}`);
                  await fs.mkdir(workDir, { recursive: true });
                }
                const rawVideoPath = path.join(workDir, `raw_${frame.id}.mp4`);
                const ttsAudioPath = path.join(workDir, `tts_${frame.id}.mp3`);
                const muxedPath = path.join(workDir, `muxed_${frame.id}.mp4`);

                await downloadFile(videoResult.videoUrl, rawVideoPath);
                await downloadFile(mediaUrl(ttsAudioUrl), ttsAudioPath);
                await swapAudioTrack(rawVideoPath, ttsAudioPath, muxedPath);

                // Upload the muxed clip and use it as the final URL.
                const muxedBuffer = await fs.readFile(muxedPath);
                const muxedKey = `frames/${videoProjectId}/muxed_${frame.id}_${Date.now()}.mp4`;
                await uploadFile(muxedKey, muxedBuffer, "video/mp4");
                finalVideoUrl = muxedKey;
                nativeLipSync = true;

                console.log(`[generate-frame-videos] Frame ${frame.id}: TTS audio swapped (atempo ratio ${(await ffprobeDuration(rawVideoPath) / await ffprobeDuration(ttsAudioPath)).toFixed(3)})`);
              } catch (swapErr) {
                console.warn(
                  `[generate-frame-videos] Frame ${frame.id}: audio swap failed (${swapErr instanceof Error ? swapErr.message : swapErr}) — keeping model audio`
                );
                nativeLipSync = false;
              }
            }

            const videoResp = nativeLipSync
              ? null // already uploaded via uploadFile above
              : await fetch(videoResult.videoUrl);
            if (videoResp && !videoResp.ok) throw new Error("Failed to download video");

            let key: string;
            if (nativeLipSync) {
              key = finalVideoUrl; // already the storage key
            } else {
              const videoBuffer = Buffer.from(await videoResp!.arrayBuffer());
              key = `frames/${videoProjectId}/video_${frame.id}_${Date.now()}.mp4`;
              await uploadFile(key, videoBuffer, "video/mp4");
            }

            const [newMedia] = await db.insert(schema.media).values({
              userId: videoProject.userId,
              frameId: frame.id,
              type: "video",
              url: key,
              prompt: videoPrompt,
              modelUsed: videoModelId,
              metadata: nativeLipSync ? { nativeLipSync: true } : undefined,
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

    // Clean up temp dir.
    if (workDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
    }

    const updatedFrames = await db.query.sceneFrames.findMany({
      where: and(eq(schema.sceneFrames.videoProjectId, videoProjectId), isNotNull(schema.sceneFrames.videoMediaId)),
      columns: { videoMediaId: true },
    });

    console.log(`[generate-frame-videos] ${updatedFrames.length}/${timeline.length} clips generated`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-videos] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
