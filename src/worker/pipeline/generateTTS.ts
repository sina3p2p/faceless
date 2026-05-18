import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { db, schema, eq, updateVideoStatus, failJob, execAsync, generateTTSParallel } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { uploadFile } from "@/lib/storage";
import { TTS } from "@/lib/constants";
import { downloadFile } from "@/server/services/composer";
import type { WordTimestamp } from "@/types/tts";
import type { TVideoScene } from "@/types/video";
import {
  emotionToVoiceSettings,
  emotionToV3Tag,
  generateDialogue,
  type DialogueTurn,
} from "@/server/services/tts";
import {
  generateSong,
  transcribeSong,
  transcribeAudioBuffer,
  alignLyricsToTranscription,
} from "@/server/services/music";

/**
 * Synthesize movie scenes via the v3 Text-to-Dialogue API: the whole
 * exchange is generated in batches that each span a real stretch of
 * conversation, then force-aligned (Whisper) and sliced back into the
 * per-scene clips the rest of the pipeline expects.
 */
async function synthesizeMovieDialogue(
  scenes: TVideoScene[],
  voiceByName: Map<string, string>,
  fallbackVoiceId: string,
  workDir: string
): Promise<{ audioPaths: string[]; perSceneCaptions: WordTimestamp[][] }> {
  const voiceFor = (scene: TVideoScene) => {
    const speaker = scene.speaker?.trim();
    if (speaker && speaker.toLowerCase() !== "narrator") {
      const v = voiceByName.get(speaker.toLowerCase());
      if (v) return v;
    }
    return fallbackVoiceId;
  };

  // Batch contiguous scenes under the per-request char budget so each call
  // still spans a real stretch of conversation (cross-line context) while
  // staying within the API limit.
  const batches: number[][] = [];
  let cur: number[] = [];
  let curChars = 0;
  scenes.forEach((scene, i) => {
    const len = scene.text.length;
    if (cur.length > 0 && (curChars + len > TTS.dialogueMaxCharsPerRequest || cur.length >= 12)) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(i);
    curChars += len;
  });
  if (cur.length) batches.push(cur);

  const audioPaths: string[] = new Array(scenes.length);
  const perSceneCaptions: WordTimestamp[][] = new Array(scenes.length);

  for (let b = 0; b < batches.length; b++) {
    const idxs = batches[b];
    const batchScenes = idxs.map((i) => scenes[i]);
    const inputs: DialogueTurn[] = batchScenes.map((scene) => {
      const tag = emotionToV3Tag(scene.emotion, scene.emotionIntensity);
      return {
        text: tag ? `${tag} ${scene.text}` : scene.text,
        voiceId: voiceFor(scene),
      };
    });

    console.log(`[generate-tts] Dialogue batch ${b + 1}/${batches.length}: ${inputs.length} turns`);
    const combined = await generateDialogue(inputs);
    const combinedPath = path.join(workDir, `dialogue_${b}.mp3`);
    await fs.writeFile(combinedPath, combined);

    let totalMs = 0;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${combinedPath}"`
      );
      totalMs = Math.round((parseFloat(stdout.trim()) || 0) * 1000);
    } catch { /* alignment interpolates when total is unknown */ }

    const whisper = await transcribeAudioBuffer(combined, `dialogue batch ${b + 1}`);
    const aligned = alignLyricsToTranscription(batchScenes, whisper, totalMs);

    for (let k = 0; k < idxs.length; k++) {
      const sceneIdx = idxs[k];
      const a = aligned[k];
      const startSec = Math.max(0, a.startMs / 1000);
      const durSec = Math.max(0.3, (a.endMs - a.startMs) / 1000);
      const clipPath = path.join(workDir, `audio_${sceneIdx}.mp3`);
      // Re-encode (not -c copy) so the cut lands exactly on the aligned
      // boundary and the clip is a valid standalone mp3.
      await execAsync(
        `ffmpeg -y -i "${combinedPath}" -ss ${startSec.toFixed(3)} -t ${durSec.toFixed(3)} -c:a libmp3lame -q:a 4 "${clipPath}"`
      );
      audioPaths[sceneIdx] = clipPath;
      perSceneCaptions[sceneIdx] = a.wordTimestamps;
      console.log(`[generate-tts] Dialogue scene ${sceneIdx}: ${startSec.toFixed(1)}s +${durSec.toFixed(1)}s, ${a.wordTimestamps.length} caption words`);
    }
  }

  return { audioPaths, perSceneCaptions };
}

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

      const voiceByName = new Map<string, string>();
      let perSceneVoiceIds: (string | undefined)[] | undefined;
      if (videoProject.videoType === "movie") {
        const registry = videoProject.config?.continuityNotes?.characterRegistry ?? [];
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

      let audioPaths: string[];
      let perSceneCaptions: WordTimestamp[][];

      let dialogue: { audioPaths: string[]; perSceneCaptions: WordTimestamp[][] } | null = null;
      if (videoProject.videoType === "movie" && TTS.useDialogueMode) {
        try {
          dialogue = await synthesizeMovieDialogue(
            scenes,
            voiceByName,
            videoProject.voiceId ?? TTS.defaultVoiceId,
            workDir
          );
          console.log(`[generate-tts] Dialogue mode: ${scenes.length} turns synthesized as one conversation`);
        } catch (err) {
          console.warn(
            `[generate-tts] Dialogue mode failed (${err instanceof Error ? err.message : String(err)}); falling back to per-scene TTS`
          );
          dialogue = null;
        }
      }

      if (dialogue) {
        audioPaths = dialogue.audioPaths;
        perSceneCaptions = dialogue.perSceneCaptions;
      } else {
        const result = await generateTTSParallel(
          sceneTexts,
          videoProject.voiceId,
          workDir,
          undefined,
          perSceneVoiceIds,
          perSceneVoiceSettings
        );
        audioPaths = result.audioPaths;
        perSceneCaptions = result.ttsResults.map((r) => r.wordTimestamps);
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
            captionData: perSceneCaptions[index],
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
