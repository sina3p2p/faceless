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
import {
  generateSong,
  transcribeSong,
  alignLyricsToTranscription,
} from "@/server/services/music";
import { getProjectConfig } from "./shared";

export async function generateTTSJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-tts-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "TTS_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes for audio generation");

    const isMusic = videoProject.videoType === "music_video";

    if (isMusic) {
      const scriptMd = videoProject.script!;

      const genreMatch = scriptMd.match(/^Genre:\s*(.+)$/m);
      const genre = genreMatch ? genreMatch[1].trim() : "pop, catchy";
      const title = videoProject.title ?? "Untitled";

      const songSections = existingScenes.map((s) => ({
        sectionName: s.sceneTitle || `Section ${s.sceneOrder + 1}`,
        lyrics: s.text.split("\n").filter((l: string) => l.trim()),
        durationMs: (s.duration ?? 10) * 1000,
      }));

      const projectConfig = getProjectConfig(videoProject?.config);
      const targetDurationSec = projectConfig.duration?.preferred;

      console.log(`[generate-tts] Music mode: generating song "${title}" (${genre}), ${songSections.length} sections${targetDurationSec ? `, target ~${targetDurationSec}s` : ""}`);

      const songResult = await generateSong(title, genre, songSections, targetDurationSec);

      const songPath = path.join(workDir, "song.mp3");
      await downloadFile(songResult.audioUrl, songPath);
      const songBuffer = await fs.readFile(songPath);
      const songKey = `scenes/${videoProjectId}/song_${Date.now()}.mp3`;
      await uploadFile(songKey, songBuffer, "audio/mpeg");

      const whisperWords = await transcribeSong(songResult.audioUrl);
      const totalDurationMs = Math.round(songResult.duration * 1000);
      const alignedSections = alignLyricsToTranscription(songSections, whisperWords, totalDurationMs);

      const existingConfig = ((await db.query.videoProjects.findFirst({
        where: eq(schema.videoProjects.id, videoProjectId),
        columns: { config: true },
      }))?.config ?? {}) as Record<string, unknown>;

      await db
        .update(schema.videoProjects)
        .set({
          duration: Math.round(songResult.duration),
          config: { ...existingConfig, songUrl: songKey, alignedSections },
        })
        .where(eq(schema.videoProjects.id, videoProjectId));

      for (let i = 0; i < existingScenes.length; i++) {
        const aligned = alignedSections[i];
        if (!aligned) continue;
        const durationSec = Math.ceil((aligned.endMs - aligned.startMs) / 1000);

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: songKey,
            captionData: aligned.wordTimestamps,
            duration: durationSec,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));

        console.log(`[generate-tts] Section ${i} (${songSections[i].sectionName}): ${durationSec}s`);
      }

      console.log(`[generate-tts] Song generated and aligned (${alignedSections.length} sections, ${songResult.duration.toFixed(1)}s total)`);
    } else {
      const sceneTexts = existingScenes.map((s) => s.text);
      console.log(`[generate-tts] Generating TTS for ${sceneTexts.length} scenes`);

      const { audioPaths, ttsResults } = await generateTTSParallel(
        sceneTexts,
        videoProject.voiceId,
        workDir
      );

      for (let i = 0; i < existingScenes.length; i++) {
        const audioBuffer = await fs.readFile(audioPaths[i]);
        const audioKey = `scenes/${videoProjectId}/audio_${existingScenes[i].id}_${Date.now()}.mp3`;
        await uploadFile(audioKey, audioBuffer, "audio/mpeg");

        let durationSec = 5;
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPaths[i]}"`
          );
          durationSec = Math.ceil(parseFloat(stdout.trim()) || 5);
        } catch { /* fallback to 5s */ }

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: audioKey,
            captionData: ttsResults[i].wordTimestamps,
            duration: durationSec,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));

        console.log(`[generate-tts] Scene ${i}: ${durationSec}s audio uploaded`);
      }

      console.log(`[generate-tts] All TTS complete`);
    }

    await renderQueue.add("cinematography", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
