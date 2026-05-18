import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { db, schema, eq, updateVideoStatus, failJob, execAsync, generateTTSParallel } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { uploadFile } from "@/lib/storage";
import { downloadFile } from "@/server/services/composer";
import { emotionToVoiceSettings, type TTSResult } from "@/server/services/tts";
import { TTS } from "@/lib/constants";
import { generateMovieDialogueAudio } from "./movieDialogue";
import {
  generateSong,
  transcribeSong,
  alignLyricsToTranscription,
} from "@/server/services/music";

export async function generateTTSJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-tts-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

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

    const isMusic = videoProject.videoType === "music_video";

    if (isMusic) {
      const projectConfig = videoProject.config ?? {};
      const genre = projectConfig.musicGenre?.trim() || "pop, catchy";
      const title = videoProject.title ?? "Untitled";
      const lyrics = videoProject.script!.trim();

      const targetDurationSec = projectConfig.duration?.preferred;

      console.log(`[generate-tts] Music mode: generating song "${title}" (${genre}), ${lyrics.length} chars of lyrics${targetDurationSec ? `, target ~${targetDurationSec}s` : ""}`);

      const songResult = await generateSong(title, genre, lyrics, targetDurationSec);

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

      console.log(`[generate-tts] Song generated and aligned (${alignedSections.length} sections, ${songResult.duration.toFixed(1)}s total)`);
    } else {
      const sceneTexts = scenes.map((scene) => scene.text);
      console.log(`[generate-tts] Generating TTS for ${sceneTexts.length} scenes`);

      const useDialog =
        videoProject.videoType === "movie" &&
        (videoProject.config?.movieDialogMode ?? true) &&
        TTS.dialogEnabled;

      let audioPaths: string[];
      let ttsResults: TTSResult[];

      if (useDialog) {
        const registry =
          videoProject.config?.continuityNotes?.characterRegistry ?? [];
        console.log(
          `[generate-tts] Movie dialog mode: v3 Text-to-Dialogue for ${scenes.length} scenes`
        );
        ({ audioPaths, ttsResults } = await generateMovieDialogueAudio(
          scenes.map((s) => ({
            text: s.text,
            speaker: s.speaker,
            emotion: s.emotion,
            emotionIntensity: s.emotionIntensity,
          })),
          registry,
          videoProject.voiceId,
          workDir
        ));
        const emotionMix = scenes.reduce<Record<string, number>>((acc, s) => {
          const key = s.emotion ?? "unset";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {});
        console.log(
          `[generate-tts] Emotional delivery mix: ${JSON.stringify(emotionMix)}`
        );
      } else {
      let perSceneVoiceIds: (string | undefined)[] | undefined;
      if (videoProject.videoType === "movie") {
        const registry = videoProject.config?.continuityNotes?.characterRegistry ?? [];
        const voiceByName = new Map<string, string>();
        for (const c of registry) {
          if (c.voiceId) voiceByName.set(c.canonicalName.toLowerCase(), c.voiceId);
        }
        perSceneVoiceIds = scenes.map((scene) => {
          const speaker = scene.speaker?.trim();
          if (!speaker || speaker.toLowerCase() === "narrator") return undefined;
          return voiceByName.get(speaker.toLowerCase());
        });
        const distinct = new Set(perSceneVoiceIds.filter(Boolean)).size;
        console.log(`[generate-tts] Movie mode: ${distinct} character voice(s) across ${scenes.length} scenes (narrator/default for the rest)`);
      }

      // Per-scene emotional delivery: map each scene's emotion → ElevenLabs
      // voice_settings so lines are acted, not read flat. Applies to every
      // non-music type; scenes with no emotion fall back to a neutral baseline.
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

      ({ audioPaths, ttsResults } = await generateTTSParallel(
        sceneTexts,
        videoProject.voiceId,
        workDir,
        undefined,
        perSceneVoiceIds,
        perSceneVoiceSettings
      ));
      }

      for (const [index, scene] of scenes.entries()) {
        const audioBuffer = await fs.readFile(audioPaths[index]);
        const audioKey = `scenes/${videoProjectId}/audio_${scene.id}_${Date.now()}.mp3`;
        await uploadFile(audioKey, audioBuffer, "audio/mpeg");

        let durationSec = 5;
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPaths[index]}"`
          );
          durationSec = Math.ceil(parseFloat(stdout.trim()) || 5);
        } catch { /* fallback to 5s */ }

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: audioKey,
            captionData: ttsResults[index].wordTimestamps,
            duration: durationSec,
          })
          .where(eq(schema.videoScenes.id, scene.id));

        console.log(`[generate-tts] Scene ${index}: ${durationSec}s audio uploaded`);
      }

      console.log(`[generate-tts] All TTS complete`);
    }

    // Timelapse projects skip the entire narrative middle (cinematography,
    // hero-asset extraction, storyboard, prompt-architect) — the timelapse
    // planner already wrote scenes/frames with imagePrompts and motionSpecs.
    const nextJob = videoProject.videoType === "timelapse"
      ? "generate-frame-images"
      : "cinematography";
    await renderQueue.add(nextJob, { videoProjectId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
