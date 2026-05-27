import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { db, schema, eq, updateVideoStatus, failJob, execAsync } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getVideoSize } from "@/lib/constants";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { downloadFile, composeVideo, type ComposerScene } from "@/server/services/composer";
import { buildXfadeFilterChain, sceneNeedsXfade } from "@/server/services/composer/xfade";
import type { TransitionType, PipelineConfig } from "@/types/pipeline";

async function buildComposerScenes(
  videoProjectId: string,
  workDir: string,
  options: { nativeAudio: boolean }
): Promise<{ scenes: ComposerScene[]; sfxCues: Array<{ type: string; atSeconds: number; durationS: number }> }> {
  const existingScenes = await db.query.videoScenes.findMany({
    where: eq(schema.videoScenes.videoProjectId, videoProjectId),
    orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
  });

  const scenes: ComposerScene[] = [];
  const sfxCues: Array<{ type: string; atSeconds: number; durationS: number }> = [];
  let timelineCursor = 0;

  for (let i = 0; i < existingScenes.length; i++) {
    const scene = existingScenes[i];

    // nativeAudio: dialogue is baked into the video clip (Seedance lipsync) — skip external download.
    // Otherwise download the audio file for the composer to mix.
    let audioPath: string | undefined;
    if (scene.audioUrl && !options.nativeAudio) {
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
      await fs.writeFile(concatFile, frameMediaPaths.map((p) => `file '${p}'`).join("\n"));
      mediaPath = path.join(workDir, `scene_${i}_combined.mp4`);
      await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${mediaPath}"`);
      totalDuration = frameDurations.reduce((a, b) => a + b, 0);
    }

    const wordTimestamps =
      (scene.captionData as Array<{ word: string; start: number; end: number }>) || [];

    let frameCursor = 0;
    for (const frame of frames) {
      const hint = frame.sfxHint;
      if (hint && hint !== "none") {
        sfxCues.push({ type: hint, atSeconds: timelineCursor + frameCursor, durationS: 0.6 });
      }
      frameCursor += frame.clipDuration ?? 5;
    }
    timelineCursor += totalDuration;

    scenes.push({
      text: scene.text,
      audioPath,
      nativeAudio: options.nativeAudio && !!scene.audioUrl,
      mediaPath,
      mediaType: "video",
      duration: totalDuration,
      wordTimestamps,
    });
  }

  return { scenes, sfxCues };
}

async function runCompose(
  videoProjectId: string,
  workDir: string,
  nativeAudio: boolean,
  label: string
): Promise<void> {
  const videoProject = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
  });
  if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

  await updateVideoStatus(videoProjectId, "RENDERING");

  const sizeConfig = getVideoSize(videoProject.videoSize);
  const projectConfig = (videoProject.config ?? {}) as PipelineConfig;

  const { scenes: composerScenes, sfxCues } = await buildComposerScenes(
    videoProjectId,
    workDir,
    { nativeAudio }
  );

  if (composerScenes.length === 0) throw new Error("No scenes to compose");

  let globalAudioPath: string | undefined;
  if (projectConfig.songUrl) {
    globalAudioPath = path.join(workDir, "global_song.mp3");
    await downloadFile(mediaUrl(projectConfig.songUrl), globalAudioPath);
  }

  console.log(
    `[${label}] Composing ${composerScenes.length} scenes${
      globalAudioPath ? " (global audio track)" : ""
    }`
  );

  const enableSfx = projectConfig.enableSfx === true;
  const sfx = enableSfx && sfxCues.length > 0 ? sfxCues : undefined;
  if (sfx) console.log(`[${label}] SFX enabled: ${sfx.length} cues`);

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
  console.log(`[${label}] Video complete: ${s3Key}`);
}

export async function composeFinalJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-compose-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });
  try {
    await runCompose(videoProjectId, workDir, false, "compose-final");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[compose-final] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// Seedance 2 movie: video clips already have dialogue baked in via reference_audios.
// The composer preserves native audio streams instead of mixing external files.
export async function composeFinalSeedance2Job(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-compose-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });
  try {
    await runCompose(videoProjectId, workDir, true, "compose-final:seedance-2");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[compose-final:seedance-2] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
