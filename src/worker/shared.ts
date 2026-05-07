import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, ne, desc, asc } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { DATABASE, WORKER } from "@/lib/constants";
import { generateSpeech, type TTSResult } from "@/server/services/tts";
import { mediaUrl } from "@/lib/storage";
import { env } from "@/lib/constants";
import type { StoryAssetInput } from "@/types/worker";
import { storyAssets, videoStoryAssets } from "@/server/db/schema";

const client = postgres(DATABASE.url);
export const db = drizzle(client, { schema });
export { schema, eq, and, ne, desc };

export const execAsync = promisify(exec);

export async function updateVideoStatus(
  videoProjectId: string,
  status: typeof schema.videoStatusEnum.enumValues[number],
  extra?: Partial<typeof schema.videoProjects.$inferInsert>
) {
  await db
    .update(schema.videoProjects)
    .set({ status, ...extra })
    .where(eq(schema.videoProjects.id, videoProjectId));
}

export async function resolveStoryAssets(
  videoProjectId: string
): Promise<StoryAssetInput[]> {
  const rows = await db
    .select({ asset: storyAssets })
    .from(videoStoryAssets)
    .innerJoin(storyAssets, eq(videoStoryAssets.storyAssetId, storyAssets.id))
    .where(eq(videoStoryAssets.videoProjectId, videoProjectId))
    .orderBy(asc(videoStoryAssets.sortOrder));

  return rows.map((a) => ({
    ...a.asset,
    url: mediaUrl(a.asset.url),
    sheetUrl: a.asset.sheetUrl ? mediaUrl(a.asset.sheetUrl) : undefined,
    voiceId: a.asset.voiceId ?? undefined,
  }));
}

export function filterAssetsByRefs(
  allAssets: StoryAssetInput[],
  assetRefs: string[] | null | undefined
): StoryAssetInput[] {
  if (!assetRefs || assetRefs.length === 0) return allAssets;
  const refSet = new Set(assetRefs.map((r) => r.toLowerCase()));
  return allAssets.filter((a) => refSet.has(a.name.toLowerCase()));
}

export async function generateTTSParallel(
  sceneTexts: string[],
  voiceId: string | null | undefined,
  workDir: string,
  concurrency = WORKER.parallelTTS,
  perSceneVoiceIds?: (string | undefined)[]
): Promise<{ audioPaths: string[]; ttsResults: TTSResult[] }> {
  const audioPaths: string[] = new Array(sceneTexts.length);
  const ttsResults: TTSResult[] = new Array(sceneTexts.length);

  const chunks: number[][] = [];
  for (let i = 0; i < sceneTexts.length; i += concurrency) {
    chunks.push(
      Array.from({ length: Math.min(concurrency, sceneTexts.length - i) }, (_, j) => i + j)
    );
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const sceneVoice = perSceneVoiceIds?.[i] ?? voiceId ?? env("ELEVENLABS_DEFAULT_VOICE_ID");
        const result = await generateSpeech(sceneTexts[i], { voiceId: sceneVoice });
        const audioPath = path.join(workDir, `audio_${i}.mp3`);
        await fs.writeFile(audioPath, result.audioBuffer);
        audioPaths[i] = audioPath;
        ttsResults[i] = result;
        console.log(`Scene ${i}: TTS done (voice=${sceneVoice || "default"}), ${result.wordTimestamps.length} word timestamps`);
      })
    );
  }

  return { audioPaths, ttsResults };
}

export async function failJob(videoProjectId: string, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  await db
    .update(schema.renderJobs)
    .set({ status: "FAILED", error: errorMessage })
    .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
  return errorMessage;
}
