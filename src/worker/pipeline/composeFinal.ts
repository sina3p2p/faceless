import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { db, schema, eq, updateVideoStatus, failJob, execAsync } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getVideoSize, LIPSYNC, WORKER } from "@/lib/constants";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { downloadFile, composeVideo, type ComposerScene } from "@/server/services/composer";
import { buildXfadeFilterChain, sceneNeedsXfade } from "@/server/services/composer/xfade";
import { lipSyncClip } from "@/server/services/ai/video";
import type { TransitionType } from "@/types/pipeline";

export async function composeFinalJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-compose-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "RENDERING");

    if (
      videoProject.videoType === "movie" &&
      (videoProject.config?.lipSyncEnabled ?? true)
    ) {
      await applyLipSync(videoProjectId, videoProject.userId, workDir);
    }

    const sizeConfig = getVideoSize(videoProject.videoSize);

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const composerScenes: ComposerScene[] = [];
    const sfxCues: Array<{ type: string; atSeconds: number; durationS: number }> = [];
    let timelineCursor = 0;

    for (let i = 0; i < existingScenes.length; i++) {
      const scene = existingScenes[i];

      let audioPath: string | undefined;
      if (scene.audioUrl) {
        audioPath = path.join(workDir, `audio_${i}.mp3`);
        await downloadFile(mediaUrl(scene.audioUrl), audioPath);
      }

      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, scene.id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { videoMedia: true },
      });

      const frameMediaPaths: string[] = [];
      const frameDurations: number[] = [];
      const frameTransitions: (TransitionType | null)[] = [];

      for (let j = 0; j < frames.length; j++) {
        const frame = frames[j];
        if (frame.videoMedia?.url) {
          const videoPath = path.join(workDir, `scene_${i}_frame_${j}.mp4`);
          await downloadFile(mediaUrl(frame.videoMedia.url), videoPath);
          frameMediaPaths.push(videoPath);
          frameDurations.push(frame.clipDuration ?? 5);
          frameTransitions.push((frame.transitionIn as TransitionType | null) ?? null);
        }
      }

      if (frameMediaPaths.length === 0) continue;

      let mediaPath: string;
      let totalDuration: number;
      if (frameMediaPaths.length === 1) {
        mediaPath = frameMediaPaths[0];
        totalDuration = frameDurations[0];
      } else if (sceneNeedsXfade(frameTransitions)) {
        // Re-encode with an xfade chain so transitions actually play.
        // More expensive than concat-copy, used only when the storyboarder
        // chose a non-cut transition for at least one frame.
        const chain = buildXfadeFilterChain(frameDurations, frameTransitions);
        mediaPath = path.join(workDir, `scene_${i}_combined.mp4`);
        const inputs = frameMediaPaths.map((p) => `-i "${p}"`).join(" ");
        await execAsync(
          `ffmpeg -y ${inputs} -filter_complex "${chain.filter}" ` +
            `-map "${chain.outLabel}" -an ` +
            `-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p ` +
            `"${mediaPath}"`
        );
        totalDuration = chain.effectiveTotalDuration;
      } else {
        const concatFile = path.join(workDir, `concat_${i}.txt`);
        const concatContent = frameMediaPaths.map((p) => `file '${p}'`).join("\n");
        await fs.writeFile(concatFile, concatContent);
        mediaPath = path.join(workDir, `scene_${i}_combined.mp4`);
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${mediaPath}"`);
        totalDuration = frameDurations.reduce((a, b) => a + b, 0);
      }

      const wordTimestamps = (scene.captionData as Array<{ word: string; start: number; end: number }>) || [];

      // Accumulate SFX cues using each frame's start time within the scene.
      // Approximates xfade-compressed timelines slightly; SFX cues are loose
      // by design so the offset is acceptable for v1.
      let frameCursor = 0;
      for (const frame of frames) {
        const hint = frame.sfxHint;
        if (hint && hint !== "none") {
          sfxCues.push({
            type: hint,
            atSeconds: timelineCursor + frameCursor,
            durationS: 0.6,
          });
        }
        frameCursor += frame.clipDuration ?? 5;
      }
      timelineCursor += totalDuration;

      composerScenes.push({
        text: scene.text,
        audioPath: audioPath || "",
        mediaPath,
        mediaType: "video",
        duration: totalDuration,
        wordTimestamps,
      });
    }

    if (composerScenes.length === 0) throw new Error("No scenes to compose");

    const isMusic = videoProject.videoType === "music_video";
    let globalAudioPath: string | undefined;
    if (isMusic) {
      const projectConfig = videoProject.config ?? {};
      const songKey = projectConfig.songUrl;
      if (songKey) {
        globalAudioPath = path.join(workDir, "global_song.mp3");
        await downloadFile(mediaUrl(songKey), globalAudioPath);
      }
    }

    console.log(`[compose-final] Composing ${composerScenes.length} scenes${isMusic ? " (music video, global audio)" : ""}`);

    const projectConfig = videoProject.config ?? {};
    const enableSfx = projectConfig.enableSfx === true;
    const sfx = enableSfx && sfxCues.length > 0 ? sfxCues : undefined;
    if (sfx) {
      console.log(`[compose-final] SFX enabled: ${sfx.length} cues`);
    }

    const outputPath = await composeVideo({
      scenes: composerScenes,
      videoWidth: sizeConfig.width,
      videoHeight: sizeConfig.height,
      captionStyle: "none",
      globalAudioPath,
      sfx,
    });

    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `output/${videoProjectId}/video_${Date.now()}.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });

    console.log(`[compose-final] Video complete: ${s3Key}`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[compose-final] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}

interface LipSyncTarget {
  frameId: string;
  videoUrl: string;
  audioSegPath: string;
}

async function ffprobeDurationSafe(file: string): Promise<number> {
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
 * Movie type: lip-sync the speaking-close-up frames to their scene audio.
 * Runs as the first step of compose so every entry point that reaches
 * compose-final (auto-chain, manual approval, recompose, rerender, resume)
 * gets it. Idempotent — frames whose current clip is already lip-synced
 * (media.metadata.lipSync) are skipped, so re-runs are safe and cheap.
 * Per-frame failures are swallowed: the original clip is kept and compose
 * proceeds. Lip-sync never blocks the render.
 */
async function applyLipSync(
  videoProjectId: string,
  userId: string,
  workDir: string
): Promise<void> {
  if (!LIPSYNC.replicateToken) {
    console.warn("[compose-final] lip-sync skipped: REPLICATE_API_TOKEN not set");
    return;
  }

  const scenes = await db.query.videoScenes.findMany({
    where: eq(schema.videoScenes.videoProjectId, videoProjectId),
    orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
  });

  const targets: LipSyncTarget[] = [];

  for (const scene of scenes) {
    const speaker = scene.speaker?.trim().toLowerCase();
    if (!speaker || speaker === "narrator" || !scene.audioUrl) continue;

    const frames = await db.query.sceneFrames.findMany({
      where: eq(schema.sceneFrames.sceneId, scene.id),
      orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
      with: { videoMedia: true },
    });

    const flagged = frames.filter(
      (f) => f.isSpeakingCloseup && f.videoMediaId && f.videoMedia?.url
    );
    if (flagged.length === 0) continue;

    const sceneAudioPath = path.join(workDir, `lipsync_audio_${scene.id}.mp3`);
    try {
      await downloadFile(mediaUrl(scene.audioUrl), sceneAudioPath);
    } catch (err) {
      console.warn(
        `[compose-final] lip-sync: scene ${scene.id} audio download failed (${err instanceof Error ? err.message : err}) — skipping scene`
      );
      continue;
    }
    const audioDur = await ffprobeDurationSafe(sceneAudioPath);
    if (audioDur <= 0) continue;

    let cursor = 0;
    for (const frame of frames) {
      const clip = frame.clipDuration ?? 5;
      const isFlagged = flagged.some((f) => f.id === frame.id);
      const single = frames.length === 1;
      const start = single ? 0 : Math.min(cursor, audioDur);
      const end = single ? audioDur : Math.min(cursor + clip, audioDur);
      cursor += clip;

      if (!isFlagged) continue;

      const alreadySynced =
        (frame.videoMedia?.metadata as { lipSync?: boolean } | null)?.lipSync ===
        true;
      if (alreadySynced) continue;
      if (end - start < 0.3) continue;

      const audioSegPath = path.join(workDir, `lipsync_seg_${frame.id}.mp3`);
      try {
        await execAsync(
          `ffmpeg -y -hide_banner -i "${sceneAudioPath}" -ss ${start.toFixed(3)} -to ${end.toFixed(3)} ` +
            `-c:a libmp3lame -q:a 4 "${audioSegPath}"`
        );
      } catch {
        continue;
      }
      targets.push({
        frameId: frame.id,
        videoUrl: mediaUrl(frame.videoMedia!.url),
        audioSegPath,
      });
    }
  }

  if (targets.length === 0) {
    console.log("[compose-final] lip-sync: no speaking-close-up frames to sync");
    return;
  }

  console.log(`[compose-final] lip-sync: ${targets.length} frame(s)`);

  const BATCH = WORKER.parallelVideos;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (t) => {
        try {
          const segBuffer = await fs.readFile(t.audioSegPath);
          const segKey = `scenes/${videoProjectId}/lipsync_seg_${t.frameId}_${Date.now()}.mp3`;
          await uploadFile(segKey, segBuffer, "audio/mpeg");

          const result = await lipSyncClip(t.videoUrl, mediaUrl(segKey));

          const resp = await fetch(result.videoUrl);
          if (!resp.ok) throw new Error(`download lip-synced clip failed (${resp.status})`);
          const outBuffer = Buffer.from(await resp.arrayBuffer());
          const key = `frames/${videoProjectId}/lipsync_${t.frameId}_${Date.now()}.mp4`;
          await uploadFile(key, outBuffer, "video/mp4");

          const [newMedia] = await db
            .insert(schema.media)
            .values({
              userId,
              frameId: t.frameId,
              type: "video",
              url: key,
              prompt: "lip-sync",
              modelUsed: LIPSYNC.model,
              metadata: { lipSync: true },
            })
            .returning();

          await db
            .update(schema.sceneFrames)
            .set({ videoMediaId: newMedia.id })
            .where(eq(schema.sceneFrames.id, t.frameId));

          console.log(`[compose-final] lip-sync: frame ${t.frameId} synced`);
        } catch (err) {
          console.error(
            `[compose-final] lip-sync: frame ${t.frameId} failed (${err instanceof Error ? err.message : err}) — keeping original clip`
          );
        }
      })
    );
  }
}
