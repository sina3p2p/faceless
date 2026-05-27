import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { db, schema, eq, updateVideoStatus, failJob, generateTTSParallel } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { emotionToVoiceSettings } from "@/server/services/tts";
import {
  generateSong,
  transcribeSong,
  alignLyricsToTranscription,
} from "@/server/services/music";
import { uploadFile } from "@/lib/storage";
import { downloadFile } from "@/server/services/composer";
import { generateMovieDialogueAudio } from "./movieDialogue";
import { persistPerSceneAudio } from "./ttsPersist";
import { TTS } from "@/lib/constants";
import type { PipelineConfig } from "@/types/pipeline";

async function withWorkDir<T>(fn: (workDir: string) => Promise<T>): Promise<T> {
  const workDir = path.join(os.tmpdir(), `faceless-tts-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });
  try {
    return await fn(workDir);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function generateTtsVoiceoverJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "TTS_GENERATION");

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (scenes.length === 0) throw new Error("No scenes for audio generation");

    const perSceneVoiceSettings = scenes.map((scene) => ({
      ...emotionToVoiceSettings(scene.emotion, scene.emotionIntensity),
      emotion: scene.emotion,
      emotionIntensity: scene.emotionIntensity,
    }));
    const emotionMix = scenes.reduce<Record<string, number>>((acc, s) => {
      const key = s.emotion ?? "unset";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[generate-tts] Emotional delivery mix: ${JSON.stringify(emotionMix)}`);

    await withWorkDir(async (workDir) => {
      const { audioPaths, ttsResults } = await generateTTSParallel(
        scenes.map((s) => s.text),
        videoProject.voiceId,
        workDir,
        undefined,
        undefined,
        perSceneVoiceSettings
      );
      await persistPerSceneAudio(videoProjectId, scenes, audioPaths, ttsResults);
    });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

export async function generateTtsSongJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "TTS_GENERATION");

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (scenes.length === 0) throw new Error("No scenes for song alignment");

    const projectConfig = (videoProject.config ?? {}) as PipelineConfig;
    const genre = projectConfig.musicGenre?.trim() || "pop, catchy";
    const title = videoProject.title ?? "Untitled";
    const lyrics = videoProject.script!.trim();
    const targetDurationSec = projectConfig.duration?.preferred;

    console.log(
      `[generate-tts] Music mode: generating song "${title}" (${genre}), ${lyrics.length} chars${
        targetDurationSec ? `, target ~${targetDurationSec}s` : ""
      }`
    );

    const songResult = await generateSong(title, genre, lyrics, targetDurationSec);

    await withWorkDir(async (workDir) => {
      const songPath = path.join(workDir, "song.mp3");
      await downloadFile(songResult.audioUrl, songPath);
      const songBuffer = await fs.readFile(songPath);
      const songKey = `scenes/${videoProjectId}/song_${Date.now()}.mp3`;
      await uploadFile(songKey, songBuffer, "audio/mpeg");

      const whisperWords = await transcribeSong(songResult.audioUrl);
      const totalDurationMs = Math.round(songResult.duration * 1000);
      const alignedSections = alignLyricsToTranscription(scenes, whisperWords, totalDurationMs);

      await db
        .update(schema.videoProjects)
        .set({
          duration: Math.round(songResult.duration),
          config: { ...projectConfig, songUrl: songKey, alignedSections },
        })
        .where(eq(schema.videoProjects.id, videoProjectId));

      for (const [index, scene] of scenes.entries()) {
        const aligned = alignedSections[index];
        if (!aligned) continue;
        const durationSec = Math.ceil((aligned.endMs - aligned.startMs) / 1000);
        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: songKey,
            captionData: aligned.wordTimestamps,
            duration: durationSec,
          })
          .where(eq(schema.videoScenes.id, scene.id));
        console.log(`[generate-tts] Section ${index} (${scene.sceneTitle}): ${durationSec}s`);
      }

      console.log(
        `[generate-tts] Song generated and aligned (${alignedSections.length} sections, ${songResult.duration.toFixed(1)}s total)`
      );
    });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

export async function generateTtsMovieDialogueJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "TTS_GENERATION");

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (scenes.length === 0) throw new Error("No scenes for audio generation");

    const config = (videoProject.config ?? {}) as PipelineConfig;
    const useDialog = (config.movieDialogMode ?? true) && TTS.dialogEnabled;

    if (!useDialog) {
      // Dialog mode disabled — fall back to per-character voiceover TTS.
      const registry = config.continuityNotes?.characterRegistry ?? [];
      const voiceByName = new Map<string, string>();
      for (const c of registry) {
        if (c.voiceId) voiceByName.set(c.canonicalName.toLowerCase(), c.voiceId);
      }
      const perSceneVoiceIds = scenes.map((scene) => {
        const speaker = scene.speaker?.trim();
        if (!speaker || speaker.toLowerCase() === "narrator") return undefined;
        return voiceByName.get(speaker.toLowerCase());
      });
      const perSceneVoiceSettings = scenes.map((scene) => ({
        ...emotionToVoiceSettings(scene.emotion, scene.emotionIntensity),
        emotion: scene.emotion,
        emotionIntensity: scene.emotionIntensity,
      }));

      await withWorkDir(async (workDir) => {
        const { audioPaths, ttsResults } = await generateTTSParallel(
          scenes.map((s) => s.text),
          videoProject.voiceId,
          workDir,
          undefined,
          perSceneVoiceIds,
          perSceneVoiceSettings
        );
        await persistPerSceneAudio(videoProjectId, scenes, audioPaths, ttsResults);
      });
      return;
    }

    const registry = config.continuityNotes?.characterRegistry ?? [];
    console.log(
      `[generate-tts] Movie dialog mode: v3 Text-to-Dialogue for ${scenes.length} scenes`
    );

    const emotionMix = scenes.reduce<Record<string, number>>((acc, s) => {
      const key = s.emotion ?? "unset";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[generate-tts] Emotional delivery mix: ${JSON.stringify(emotionMix)}`);

    await withWorkDir(async (workDir) => {
      const { audioPaths, ttsResults } = await generateMovieDialogueAudio(
        scenes.map((s) => ({
          text: s.text,
          speaker: s.speaker,
          emotion: s.emotion,
          emotionIntensity: s.emotionIntensity,
        })),
        registry,
        videoProject.voiceId,
        workDir
      );
      await persistPerSceneAudio(videoProjectId, scenes, audioPaths, ttsResults);
    });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
