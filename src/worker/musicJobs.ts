import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";

import {
  db,
  schema,
  eq,
  getModelDurations,
  getPreviousTopics,
  updateJobStep,
  updateVideoStatus,
  parseCharacters,
  failJob,
} from "./shared";
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "@/lib/constants";
import {
  generateMusicLyrics,
  generateStandaloneMusicLyrics,
  generateMusicVisuals,
  type MusicLyrics,
} from "@/server/services/llm";
import {
  generateSong,
  transcribeSong,
  alignLyricsToTranscription,
  type AlignedSection,
} from "@/server/services/music";
import { downloadFile } from "@/server/services/composer";
import { uploadFile } from "@/lib/storage";
import type { RenderJobData } from "@/lib/queue";

function getModelDurationsArray(videoModel?: string | null): number[] {
  const key = videoModel || DEFAULT_VIDEO_MODEL;
  const entry = VIDEO_MODELS.find((m) => m.id === key);
  if (!entry) return [5, 10];
  return [...(entry.durations as unknown as number[])].sort((a, b) => a - b);
}

/**
 * Given a total duration to fill, returns an array of clip durations
 * using only values from the supported durations list.
 * e.g. fillWithSupportedDurations(25, [6, 10]) → [10, 10, 6]
 */
function fillWithSupportedDurations(totalDur: number, supported: number[]): number[] {
  const max = Math.max(...supported);
  if (totalDur <= max) return [totalDur];

  const clips: number[] = [];
  let remaining = totalDur;

  while (remaining > max) {
    clips.push(max);
    remaining -= max;
  }

  if (remaining > 0) {
    const closest = supported
      .filter((d) => d >= remaining)
      .sort((a, b) => a - b)[0];
    clips.push(closest ?? max);
  }

  return clips;
}

interface SplitScene {
  text: string;
  searchQuery: string;
  duration: number;
  audioUrl: string;
  captionData: Array<{ word: string; start: number; end: number }> | null;
  parentSectionIndex: number;
  subIndex: number;
}

function splitSectionsToFitModel(
  existingScenes: Array<{ id: string; text: string; searchQuery: string | null; duration: number | null }>,
  actualDurationsSec: number[],
  alignedSections: AlignedSection[] | null,
  songKey: string,
  supportedDurations: number[]
): { needsSplit: boolean; scenes: SplitScene[] } {
  const result: SplitScene[] = [];
  let needsSplit = false;
  const maxClip = Math.max(...supportedDurations);

  for (let i = 0; i < existingScenes.length; i++) {
    const dur = actualDurationsSec[i] ?? existingScenes[i].duration ?? 5;
    const scene = existingScenes[i];
    const timestamps = alignedSections?.[i]?.wordTimestamps ?? null;

    if (dur <= maxClip) {
      result.push({
        text: scene.text,
        searchQuery: scene.searchQuery || "",
        duration: dur,
        audioUrl: songKey,
        captionData: timestamps,
        parentSectionIndex: i,
        subIndex: 0,
      });
      continue;
    }

    needsSplit = true;
    const clipDurations = fillWithSupportedDurations(dur, supportedDurations);
    const clipCount = clipDurations.length;
    const sectionStartMs = alignedSections?.[i]?.startMs ?? 0;
    const sectionEndMs = alignedSections?.[i]?.endMs ?? (dur * 1000);
    const sectionDurMs = sectionEndMs - sectionStartMs;
    const totalClipDur = clipDurations.reduce((s, d) => s + d, 0);

    let offsetMs = sectionStartMs;
    for (let c = 0; c < clipCount; c++) {
      const clipFraction = clipDurations[c] / totalClipDur;
      const clipSpanMs = clipFraction * sectionDurMs;
      const clipStartMs = offsetMs;
      const clipEndMs = offsetMs + clipSpanMs;
      offsetMs = clipEndMs;

      let clipTimestamps: Array<{ word: string; start: number; end: number }> | null = null;
      if (timestamps) {
        clipTimestamps = timestamps.filter(
          (w) => w.start >= clipStartMs / 1000 && w.end <= clipEndMs / 1000
        );
      }

      const lyricLines = scene.text.split("\n");
      const linesPerClip = Math.max(1, Math.ceil(lyricLines.length / clipCount));
      const clipLines = lyricLines.slice(c * linesPerClip, (c + 1) * linesPerClip);
      const clipText = clipLines.length > 0 ? clipLines.join("\n") : scene.text;

      const baseName = scene.searchQuery || `Section ${i + 1}`;
      const subName = clipCount > 1 ? `${baseName} (part ${c + 1}/${clipCount})` : baseName;

      result.push({
        text: clipText,
        searchQuery: subName,
        duration: clipDurations[c],
        audioUrl: songKey,
        captionData: clipTimestamps,
        parentSectionIndex: i,
        subIndex: c,
      });
    }

    console.log(`[song] Section ${i} (${dur}s) split into ${clipCount} clips: [${clipDurations.join("s, ")}s] (supported: [${supportedDurations.join(", ")}])`);
  }

  return { needsSplit, scenes: result };
}

// ── Phase 1: Generate music lyrics only (no visuals) ──

export async function generateMusicLyricsJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { config: true },
    });
    const videoConfig = (videoProject?.config ?? {}) as Record<string, unknown>;
    const targetDuration = typeof videoConfig.targetDuration === "number" ? videoConfig.targetDuration : 60;

    console.log(`Music lyrics generation starting for series=${seriesId}, targetDuration=${targetDuration}s`);
    await updateVideoStatus(videoProjectId, "MUSIC_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea = topicIdeas.length > 0
      ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
      : undefined;

    const previousTopics = await getPreviousTopics(seriesId, videoProjectId);

    const isStandalone = seriesRecord.isInternal;
    let lyrics: MusicLyrics;

    if (isStandalone) {
      const prompt = topicIdeas[0] || "";
      const charImages = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
      const characters = parseCharacters(charImages);
      lyrics = await generateStandaloneMusicLyrics(
        prompt, seriesRecord.style, characters, targetDuration,
        seriesRecord.llmModel || undefined, seriesRecord.language || "en",
        getModelDurations(seriesRecord.videoModel)
      );
    } else {
      lyrics = await generateMusicLyrics(
        seriesRecord.niche, seriesRecord.style, topicIdea, targetDuration,
        seriesRecord.llmModel || undefined, previousTopics,
        seriesRecord.language || "en", getModelDurations(seriesRecord.videoModel)
      );
    }

    const scriptToStore = { ...lyrics, totalDuration: targetDuration };

    await db
      .update(schema.videoProjects)
      .set({
        title: lyrics.title,
        script: JSON.stringify(scriptToStore),
        duration: targetDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (let i = 0; i < lyrics.sections.length; i++) {
      const section = lyrics.sections[i];
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: section.lyrics.join("\n"),
        searchQuery: section.sectionName,
        duration: Math.round(section.durationMs / 1000),
      });
    }

    await updateVideoStatus(videoProjectId, "REVIEW_MUSIC_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Music lyrics ready for review: ${lyrics.title} (${lyrics.sections.length} sections)`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Music lyrics generation failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Generate Song (Suno + Whisper alignment) ──

export async function generateSongJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-song-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { script: true, config: true, title: true },
    });
    if (!videoProject?.script) throw new Error("No music script found");

    const script = JSON.parse(videoProject.script);
    const videoConfig = (videoProject.config ?? {}) as Record<string, unknown>;
    const targetDuration = typeof videoConfig.targetDuration === "number" ? videoConfig.targetDuration : 60;

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes found");

    console.log(`Song generation starting: "${videoProject.title}", targetDuration=${targetDuration}s`);
    await updateVideoStatus(videoProjectId, "MUSIC_GENERATION");
    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 10);
    await job.updateProgress(10);

    const sectionsForMusic = (script.sections || []).map((s: { sectionName: string; lyrics: string[]; durationMs: number }, i: number) => ({
      sectionName: s.sectionName,
      lyrics: existingScenes[i] ? existingScenes[i].text.split("\n") : s.lyrics,
      durationMs: (existingScenes[i]?.duration ?? Math.round(s.durationMs / 1000)) * 1000,
    }));

    const songResult = await generateSong(
      script.title || videoProject.title || "Untitled",
      script.genre || "pop",
      sectionsForMusic,
      targetDuration
    );

    const songPath = path.join(workDir, "full_song.mp3");
    await downloadFile(songResult.audioUrl, songPath);

    console.log(`Song ready: ${songResult.duration.toFixed(1)}s (target was ${targetDuration}s)`);
    await job.updateProgress(50);

    let alignedSections: AlignedSection[] | null = null;
    try {
      const whisperWords = await transcribeSong(songResult.audioUrl);
      const totalDurationMs = Math.round(songResult.duration * 1000);
      alignedSections = alignLyricsToTranscription(sectionsForMusic, whisperWords, totalDurationMs);
      console.log(`[song] Whisper alignment successful: ${alignedSections.length} sections`);
    } catch (err) {
      console.warn(`[song] Whisper alignment failed, using proportional: ${err instanceof Error ? err.message : err}`);
    }

    await job.updateProgress(70);

    const songBuffer = await fs.readFile(songPath);
    const songKey = `scenes/${videoProjectId}/full_song.mp3`;
    await uploadFile(songKey, songBuffer, "audio/mpeg");

    const totalSongDurationMs = Math.round(songResult.duration * 1000);
    const actualDurationsSec: number[] = alignedSections
      ? alignedSections.map((s) => Math.max(1, Math.round((s.endMs - s.startMs) / 1000)))
      : (() => {
          const requestedTotal = sectionsForMusic.reduce((sum: number, s: { durationMs: number }) => sum + s.durationMs, 0);
          const scale = requestedTotal > 0 ? totalSongDurationMs / requestedTotal : 1;
          return sectionsForMusic.map((s: { durationMs: number }) => Math.max(1, Math.round((s.durationMs * scale) / 1000)));
        })();

    const supportedDurations = getModelDurationsArray(seriesRecord?.videoModel);
    const { needsSplit, scenes: splitScenes } = splitSectionsToFitModel(
      existingScenes, actualDurationsSec, alignedSections, songKey, supportedDurations
    );

    if (needsSplit) {
      console.log(`[song] Splitting: ${existingScenes.length} original sections → ${splitScenes.length} scenes (supported durations: [${supportedDurations.join(", ")}]s)`);

      for (const scene of existingScenes) {
        await db.delete(schema.videoScenes).where(eq(schema.videoScenes.id, scene.id));
      }

      for (let i = 0; i < splitScenes.length; i++) {
        const s = splitScenes[i];
        await db.insert(schema.videoScenes).values({
          videoProjectId,
          sceneOrder: i,
          text: s.text,
          searchQuery: s.searchQuery,
          duration: s.duration,
          audioUrl: s.audioUrl,
          captionData: s.captionData,
        });
      }
    } else {
      for (let i = 0; i < existingScenes.length; i++) {
        await db.update(schema.videoScenes)
          .set({
            duration: actualDurationsSec[i] ?? existingScenes[i].duration,
            audioUrl: songKey,
            captionData: alignedSections?.[i]?.wordTimestamps?.length ? alignedSections[i].wordTimestamps : null,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));
      }
    }

    const updatedConfig = {
      ...videoConfig,
      songUrl: songKey,
      songDuration: songResult.duration,
      songSourceUrl: songResult.audioUrl,
      alignedSections: alignedSections || null,
    };

    await db.update(schema.videoProjects)
      .set({
        config: updatedConfig,
        duration: Math.round(songResult.duration),
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    await updateVideoStatus(videoProjectId, "MUSIC_REVIEW");
    await updateJobStep(videoProjectId, "TTS", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Song generation complete, ready for review (${needsSplit ? splitScenes.length + " split scenes" : existingScenes.length + " scenes"})`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Song generation failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Phase 2: Generate music visuals from actual timestamps ──

export async function generateMusicVisualsJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (existingScenes.length === 0) throw new Error("No scenes found");

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { script: true },
    });
    const script = videoProject?.script ? JSON.parse(videoProject.script) : null;

    console.log(`Music visuals generation starting: ${existingScenes.length} sections`);
    await updateVideoStatus(videoProjectId, "VIDEO_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const visualSections = existingScenes.map((s, i) => ({
      sectionName: s.searchQuery || script?.sections?.[i]?.sectionName || `Section ${i + 1}`,
      lyrics: s.text.split("\n"),
      durationSec: s.duration ?? 5,
    }));

    const clipDurations = getModelDurationsArray(seriesRecord.videoModel);

    const visuals = await generateMusicVisuals(
      visualSections,
      seriesRecord.style,
      seriesRecord.llmModel || undefined,
      seriesRecord.language || "en",
      clipDurations
    );

    await job.updateProgress(80);

    for (let i = 0; i < existingScenes.length; i++) {
      const visual = visuals.sections[i];
      if (!visual) continue;
      await db.update(schema.videoScenes)
        .set({
          imagePrompt: visual.imagePrompt,
          visualDescription: visual.visualDescription,
        })
        .where(eq(schema.videoScenes.id, existingScenes[i].id));
    }

    if (script) {
      const mergedSections = (script.sections || []).map((s: Record<string, unknown>, i: number) => ({
        ...s,
        imagePrompt: visuals.sections[i]?.imagePrompt || s.imagePrompt || "",
        visualDescription: visuals.sections[i]?.visualDescription || s.visualDescription || "",
      }));
      await db.update(schema.videoProjects)
        .set({ script: JSON.stringify({ ...script, sections: mergedSections }) })
        .where(eq(schema.videoProjects.id, videoProjectId));
    }

    await updateVideoStatus(videoProjectId, "REVIEW_VISUAL");
    await updateJobStep(videoProjectId, "SCRIPT", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Music visuals ready for review: ${visuals.sections.length} sections`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Music visuals generation failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
