import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import { MUSIC } from "@/lib/constants";
import type { MusicSection } from "@/server/services/llm";

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
