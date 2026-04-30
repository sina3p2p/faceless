import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

export const execAsync = promisify(exec);
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, ne, desc, asc } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { DATABASE, VIDEO_MODELS, DEFAULT_VIDEO_MODEL, WORKER } from "@/lib/constants";
import { generateSpeech, type TTSResult } from "@/server/services/tts";
import { getSignedDownloadUrl } from "@/lib/storage";
import { downloadFile } from "@/server/services/composer";
import { env } from "@/lib/constants";
import type { PreApproved, StoryAssetInput } from "@/types/worker";
import { storyAssets, videoStoryAssets } from "@/server/db/schema";

const client = postgres(DATABASE.url);
export const db = drizzle(client, { schema });
export { schema, eq, and, ne, desc };

export async function insertMedia(
  {
    sceneId,
    frameId,
  }: { sceneId?: string; frameId?: string },
  type: "image" | "video",
  url: string,
  prompt?: string | null,
  modelUsed?: string | null,
  metadata?: Record<string, unknown> | null
) {
  await db.insert(schema.media).values({
    sceneId: sceneId ?? undefined,
    frameId: frameId ?? undefined,
    type,
    url,
    prompt: prompt ?? undefined,
    modelUsed: modelUsed ?? undefined,
    metadata: metadata ?? undefined,
  });
}

export function getModelDurations(videoModel?: string | null): number[] | undefined {
  const entry = VIDEO_MODELS.find((m) => m.id === (videoModel || DEFAULT_VIDEO_MODEL));
  return entry?.durations as number[] | undefined;
}

export async function getPreviousTopics(seriesId: string, currentVideoId: string): Promise<string[]> {
  const prev = await db.query.videoProjects.findMany({
    where: and(
      eq(schema.videoProjects.seriesId, seriesId),
      ne(schema.videoProjects.id, currentVideoId)
    ),
    columns: { title: true },
    orderBy: desc(schema.videoProjects.createdAt),
    limit: 50,
  });
  return prev.map((v) => v.title).filter((t): t is string => !!t);
}

export async function updateJobStep(
  videoProjectId: string,
  step: typeof schema.renderStepEnum.enumValues[number],
  status: typeof schema.jobStatusEnum.enumValues[number],
  progress: number
) {
  await db
    .update(schema.renderJobs)
    .set({ step, status, progress })
    .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
}

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

  return Promise.all(
    rows.map(async (a) => ({
      ...a.asset,
      url: a.asset.url.startsWith("http") ? a.asset.url : await getSignedDownloadUrl(a.asset.url),
      sheetUrl: a.asset.sheetUrl
        ? (a.asset.sheetUrl.startsWith("http") ? a.asset.sheetUrl : await getSignedDownloadUrl(a.asset.sheetUrl))
        : undefined,
      voiceId: a.asset.voiceId ?? undefined,
    }))
  );

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

export async function reusePreApprovedAssets(
  scenes: Array<{ imageUrl?: string | null; videoUrl?: string | null; assetUrl?: string | null; assetType?: string | null }>,
  workDir: string
): Promise<{ images: PreApproved; videos: PreApproved }> {
  const images: PreApproved = new Map();
  const videos: PreApproved = new Map();
  await Promise.all(
    scenes.map(async (scene, i) => {
      const videoKey = scene.videoUrl;
      if (videoKey) {
        try {
          const signedUrl = await getSignedDownloadUrl(videoKey);
          const localPath = path.join(workDir, `media_${i}.mp4`);
          await downloadFile(signedUrl, localPath);
          videos.set(i, { path: localPath, type: "video", url: signedUrl });
          console.log(`Scene ${i}: Reusing existing video clip`);
        } catch (err) {
          console.warn(`Scene ${i}: Could not reuse video, will regenerate:`, err);
        }
      }

      const imageKey = scene.imageUrl || (scene.assetType !== "video" ? scene.assetUrl : null);
      if (imageKey) {
        try {
          const signedUrl = await getSignedDownloadUrl(imageKey);
          const localPath = path.join(workDir, `img_${i}.jpg`);
          await downloadFile(signedUrl, localPath);
          images.set(i, { path: localPath, type: "image", url: signedUrl });
          if (!videoKey) console.log(`Scene ${i}: Reusing existing image`);
        } catch (err) {
          console.warn(`Scene ${i}: Could not reuse image, will regenerate:`, err);
        }
      }
    })
  );
  return { images, videos };
}

export async function failJob(videoProjectId: string, error: unknown) {
  const errorMessage = error instanceof Error ? error.message : "Unknown error";

  await db
    .update(schema.renderJobs)
    .set({ status: "FAILED", error: errorMessage })
    .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
  return errorMessage;
}
