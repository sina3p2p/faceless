import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { fal } from "@fal-ai/client";
import { MUSIC, AI_VIDEO } from "@/lib/constants";
import type { MusicSection } from "@/server/services/llm";
import type { WordTimestamp } from "@/server/services/tts";

fal.config({ credentials: AI_VIDEO.falKey });

const execAsync = promisify(exec);

interface SunoTrack {
  id: string;
  audioUrl: string;
  streamAudioUrl: string;
  imageUrl: string;
  prompt: string;
  title: string;
  tags: string;
  duration: number;
}

interface SunoGenerateResponse {
  code: number;
  msg: string;
  data: { taskId: string };
}

interface SunoRecordResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    status: string;
    response?: {
      sunoData?: SunoTrack[];
    };
    errorMessage?: string;
  };
}

export interface MusicResult {
  audioUrl: string;
  duration: number;
  coverUrl?: string;
}

function buildLyricsPrompt(sections: MusicSection[]): string {
  return sections
    .map((s) => {
      const tag = s.sectionName.match(/intro|verse|chorus|bridge|outro|hook|pre-chorus/i)
        ? `[${s.sectionName}]`
        : `[${s.sectionName}]`;
      return `${tag}\n${s.lyrics.join("\n")}`;
    })
    .join("\n\n");
}

async function sunoFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${MUSIC.sunoBaseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MUSIC.sunoApiKey}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Suno API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

async function pollForCompletion(taskId: string, maxWaitMs = 300_000): Promise<SunoTrack[]> {
  const start = Date.now();
  const terminalStatuses = ["SUCCESS", "CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"];

  while (Date.now() - start < maxWaitMs) {
    const result = await sunoFetch<SunoRecordResponse>(
      `/api/v1/generate/record-info?taskId=${taskId}`
    );

    const status = result.data?.status;
    console.log(`[suno] Task ${taskId} status: ${status}`);

    if (status === "SUCCESS") {
      const tracks = result.data?.response?.sunoData;
      if (!tracks || tracks.length === 0) {
        throw new Error("Suno returned SUCCESS but no tracks");
      }
      return tracks;
    }

    if (terminalStatuses.includes(status) && status !== "SUCCESS") {
      throw new Error(`Suno generation failed: ${status} — ${result.data?.errorMessage || "unknown error"}`);
    }

    await new Promise((r) => setTimeout(r, 10_000));
  }

  throw new Error(`Suno generation timed out after ${maxWaitMs / 1000}s`);
}

export async function generateSong(
  title: string,
  genre: string,
  sections: MusicSection[]
): Promise<MusicResult> {
  const lyrics = buildLyricsPrompt(sections);

  console.log(`[suno] Generating song: "${title}" (${genre}), ${lyrics.length} chars of lyrics`);

  const response = await sunoFetch<SunoGenerateResponse>("/api/v1/generate", {
    method: "POST",
    body: JSON.stringify({
      customMode: true,
      instrumental: false,
      prompt: lyrics,
      style: genre.slice(0, 1000),
      title: title.slice(0, 100),
      model: MUSIC.sunoModel,
      callBackUrl: "https://localhost/noop",
    }),
  });

  if (response.code !== 200) {
    throw new Error(`Suno generate failed: ${response.msg}`);
  }

  const taskId = response.data.taskId;
  console.log(`[suno] Task created: ${taskId}, waiting for completion...`);

  const tracks = await pollForCompletion(taskId);

  const best = tracks.reduce((a, b) => (b.duration > a.duration ? b : a), tracks[0]);

  console.log(`[suno] Song ready: "${best.title}" (${best.duration}s)`);

  return {
    audioUrl: best.audioUrl,
    duration: best.duration,
    coverUrl: best.imageUrl,
  };
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`
  );
  return Math.round(parseFloat(stdout.trim()) * 1000);
}

export interface SplitResult {
  audioPaths: string[];
  actualDurationsMs: number[];
}

export async function splitSongIntoSections(
  songPath: string,
  sections: MusicSection[],
  outputDir: string
): Promise<SplitResult> {
  const actualSongMs = await getAudioDurationMs(songPath);
  const requestedTotalMs = sections.reduce((sum, s) => sum + s.durationMs, 0);
  const scale = requestedTotalMs > 0 ? actualSongMs / requestedTotalMs : 1;

  console.log(`[suno] Song actual: ${(actualSongMs / 1000).toFixed(1)}s, requested: ${(requestedTotalMs / 1000).toFixed(1)}s, scale: ${scale.toFixed(2)}`);

  const audioPaths: string[] = [];
  const actualDurationsMs: number[] = [];
  let offsetMs = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const scaledDurationMs = Math.round(section.durationMs * scale);
    const isLast = i === sections.length - 1;
    const durationMs = isLast ? actualSongMs - offsetMs : scaledDurationMs;

    const startSec = offsetMs / 1000;
    const durationSec = durationMs / 1000;
    const outputPath = path.join(outputDir, `section_audio_${i}.mp3`);

    await execAsync(
      `ffmpeg -y -i "${songPath}" -ss ${startSec} -t ${durationSec} -c copy "${outputPath}"`
    );

    audioPaths.push(outputPath);
    actualDurationsMs.push(durationMs);
    offsetMs += durationMs;
    console.log(`[suno] Split section ${i} (${section.sectionName}): ${startSec.toFixed(1)}s → ${(startSec + durationSec).toFixed(1)}s (${durationSec.toFixed(1)}s)`);
  }

  return { audioPaths, actualDurationsMs };
}

// ── Whisper Transcription & Lyrics Alignment ──

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

interface WhisperChunk {
  text: string;
  timestamp: [number, number];
}

export async function transcribeSong(audioUrl: string): Promise<WhisperWord[]> {
  console.log("[whisper] Transcribing song for lyrics alignment...");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await fal.subscribe("fal-ai/wizper", {
    input: {
      audio_url: audioUrl,
      task: "transcribe",
      chunk_level: "word",
      language: "auto",
    },
    logs: true,
  } as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = result.data as any;
  const chunks: WhisperChunk[] = data?.chunks || [];

  const words: WhisperWord[] = chunks
    .filter((c) => c.timestamp?.[0] != null && c.timestamp?.[1] != null)
    .map((c) => ({
      word: c.text.trim(),
      start: c.timestamp[0],
      end: c.timestamp[1],
    }));

  console.log(`[whisper] Transcribed ${words.length} words from song`);
  return words;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getFirstMeaningfulWords(lyrics: string[], count = 3): string[] {
  const allWords = lyrics
    .join(" ")
    .split(/\s+/)
    .map((w) => normalizeText(w))
    .filter((w) => w.length > 0);
  return allWords.slice(0, count);
}

export interface AlignedSection {
  sectionIndex: number;
  startMs: number;
  endMs: number;
  wordTimestamps: WordTimestamp[];
}

export function alignLyricsToTranscription(
  sections: MusicSection[],
  whisperWords: WhisperWord[],
  totalDurationMs: number
): AlignedSection[] {
  if (whisperWords.length === 0) {
    console.log("[align] No whisper words available, falling back to proportional split");
    return proportionalFallback(sections, totalDurationMs);
  }

  const normalizedWhisper = whisperWords.map((w) => ({
    ...w,
    normalized: normalizeText(w.word),
  }));

  const aligned: AlignedSection[] = [];
  let whisperIdx = 0;

  for (let si = 0; si < sections.length; si++) {
    const section = sections[si];
    const targetWords = getFirstMeaningfulWords(section.lyrics, 4);

    if (targetWords.length === 0) {
      aligned.push({
        sectionIndex: si,
        startMs: -1,
        endMs: -1,
        wordTimestamps: [],
      });
      continue;
    }

    let bestMatchIdx = -1;
    let bestScore = 0;

    for (let wi = whisperIdx; wi < normalizedWhisper.length; wi++) {
      let score = 0;
      for (let tw = 0; tw < targetWords.length && wi + tw < normalizedWhisper.length; tw++) {
        if (normalizedWhisper[wi + tw].normalized.includes(targetWords[tw]) ||
            targetWords[tw].includes(normalizedWhisper[wi + tw].normalized)) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatchIdx = wi;
      }
      if (score === targetWords.length) break;
    }

    const matchThreshold = Math.max(1, Math.floor(targetWords.length * 0.5));

    if (bestMatchIdx >= 0 && bestScore >= matchThreshold) {
      const startMs = Math.round(normalizedWhisper[bestMatchIdx].start * 1000);
      aligned.push({
        sectionIndex: si,
        startMs,
        endMs: -1,
        wordTimestamps: [],
      });
      whisperIdx = bestMatchIdx + 1;
      console.log(`[align] Section ${si} (${section.sectionName}): matched at ${(startMs / 1000).toFixed(1)}s (score ${bestScore}/${targetWords.length})`);
    } else {
      aligned.push({
        sectionIndex: si,
        startMs: -1,
        endMs: -1,
        wordTimestamps: [],
      });
      console.log(`[align] Section ${si} (${section.sectionName}): no match found, will interpolate`);
    }
  }

  // Fill in missing startMs by interpolation
  for (let i = 0; i < aligned.length; i++) {
    if (aligned[i].startMs === -1) {
      const prev = i > 0 ? aligned[i - 1].startMs : 0;
      const next = aligned.slice(i + 1).find((a) => a.startMs >= 0);
      if (next) {
        const gap = next.startMs - prev;
        const missingCount = aligned.indexOf(next) - (i > 0 ? i : 0);
        aligned[i].startMs = Math.round(prev + gap / (missingCount + 1));
      } else {
        const prevEnd = i > 0 ? aligned[i - 1].startMs : 0;
        const remaining = totalDurationMs - prevEnd;
        const remainingSections = aligned.length - i;
        aligned[i].startMs = Math.round(prevEnd + remaining / (remainingSections + 1));
      }
    }
  }

  // Compute endMs for each section
  for (let i = 0; i < aligned.length; i++) {
    aligned[i].endMs = i < aligned.length - 1
      ? aligned[i + 1].startMs
      : totalDurationMs;
  }

  // Assign word-level timestamps for each section
  for (const section of aligned) {
    const startSec = section.startMs / 1000;
    const endSec = section.endMs / 1000;
    section.wordTimestamps = whisperWords
      .filter((w) => w.start >= startSec - 0.1 && w.end <= endSec + 0.1)
      .map((w) => ({
        word: w.word,
        start: w.start - startSec,
        end: w.end - startSec,
      }));
  }

  return aligned;
}

function proportionalFallback(sections: MusicSection[], totalDurationMs: number): AlignedSection[] {
  const requestedTotal = sections.reduce((sum, s) => sum + s.durationMs, 0);
  const scale = requestedTotal > 0 ? totalDurationMs / requestedTotal : 1;
  let offset = 0;

  return sections.map((s, i) => {
    const startMs = Math.round(offset);
    const duration = i === sections.length - 1
      ? totalDurationMs - offset
      : Math.round(s.durationMs * scale);
    offset += duration;
    return {
      sectionIndex: i,
      startMs,
      endMs: Math.round(startMs + duration),
      wordTimestamps: [],
    };
  });
}

export async function splitSongAligned(
  songPath: string,
  alignedSections: AlignedSection[],
  outputDir: string
): Promise<SplitResult> {
  const audioPaths: string[] = [];
  const actualDurationsMs: number[] = [];

  for (let i = 0; i < alignedSections.length; i++) {
    const section = alignedSections[i];
    const durationMs = section.endMs - section.startMs;
    const startSec = section.startMs / 1000;
    const durationSec = durationMs / 1000;
    const outputPath = path.join(outputDir, `section_audio_${i}.mp3`);

    await execAsync(
      `ffmpeg -y -i "${songPath}" -ss ${startSec.toFixed(3)} -t ${durationSec.toFixed(3)} -c copy "${outputPath}"`
    );

    audioPaths.push(outputPath);
    actualDurationsMs.push(durationMs);
    console.log(`[align] Split section ${i}: ${startSec.toFixed(1)}s → ${(startSec + durationSec).toFixed(1)}s (${durationSec.toFixed(1)}s)`);
  }

  return { audioPaths, actualDurationsMs };
}
