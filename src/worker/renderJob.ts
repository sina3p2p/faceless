import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { generateVideoScript } from "@/server/services/llm";
import { generateSpeech, type TTSResult } from "@/server/services/tts";
import {
  getMediaForScene,
  generateImage,
  resetUsedMedia,
  type MediaAsset,
} from "@/server/services/media";
import {
  getAIVideoForScene,
  downloadAIVideo,
  uploadImageForFal,
} from "@/server/services/ai-video";
import {
  composeVideo,
  downloadFile,
  type ComposerScene,
} from "@/server/services/composer";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { recordUsage } from "@/lib/usage";
import type { RenderJobData } from "@/lib/queue";

const client = postgres(process.env.DATABASE_URL!);
const db = drizzle(client, { schema });

async function updateJobStep(
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

async function updateVideoStatus(
  videoProjectId: string,
  status: typeof schema.videoStatusEnum.enumValues[number],
  extra?: Partial<typeof schema.videoProjects.$inferInsert>
) {
  await db
    .update(schema.videoProjects)
    .set({ status, ...extra })
    .where(eq(schema.videoProjects.id, videoProjectId));
}

async function generateTTSParallel(
  sceneTexts: string[],
  voiceId: string | undefined,
  workDir: string,
  concurrency = 3
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
        const result = await generateSpeech(sceneTexts[i], { voiceId });
        const audioPath = path.join(workDir, `audio_${i}.mp3`);
        await fs.writeFile(audioPath, result.audioBuffer);
        audioPaths[i] = audioPath;
        ttsResults[i] = result;
        console.log(`Scene ${i}: TTS done, ${result.wordTimestamps.length} word timestamps`);
      })
    );
  }

  return { audioPaths, ttsResults };
}

async function fetchFacelessMediaParallel(
  script: Awaited<ReturnType<typeof generateVideoScript>>,
  seriesRecord: { niche: string; style: string },
  workDir: string,
  concurrency = 3
): Promise<{ path: string; type: "video" | "image" }[]> {
  const mediaPaths: { path: string; type: "video" | "image" }[] = new Array(script.scenes.length);

  const chunks: number[][] = [];
  for (let i = 0; i < script.scenes.length; i += concurrency) {
    chunks.push(
      Array.from({ length: Math.min(concurrency, script.scenes.length - i) }, (_, j) => i + j)
    );
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const scene = script.scenes[i];
        const searchQuery = scene.searchQuery || scene.visualDescription;
        const imagePrompt = scene.imagePrompt || scene.visualDescription;

        let asset: MediaAsset;
        try {
          asset = await getMediaForScene(searchQuery, imagePrompt, true);
        } catch (err) {
          console.warn(
            `Failed to get media for scene ${i}: ${err instanceof Error ? err.message : err}. Trying fallback.`
          );
          try {
            asset = await getMediaForScene(
              seriesRecord.niche,
              `A dramatic cinematic scene related to ${seriesRecord.niche}, ${seriesRecord.style} art style, moody lighting, photorealistic, no text`,
              false
            );
          } catch {
            throw new Error(
              `Could not find any media for scene ${i}. Check Pexels API key and OpenAI API key.`
            );
          }
        }

        const ext = asset.type === "video" ? "mp4" : "jpg";
        const mediaPath = path.join(workDir, `media_${i}.${ext}`);

        if (asset.url) {
          await downloadFile(asset.url, mediaPath);
        }

        console.log(`Scene ${i}: media from ${asset.source} (${asset.type})`);
        mediaPaths[i] = { path: mediaPath, type: asset.type };
      })
    );
  }

  return mediaPaths;
}

async function fetchAIVideoMediaParallel(
  script: Awaited<ReturnType<typeof generateVideoScript>>,
  seriesRecord: { niche: string; style: string },
  workDir: string,
  concurrency = 2
): Promise<{ path: string; type: "video" | "image" }[]> {
  const mediaPaths: { path: string; type: "video" | "image" }[] = new Array(script.scenes.length);

  const chunks: number[][] = [];
  for (let i = 0; i < script.scenes.length; i += concurrency) {
    chunks.push(
      Array.from({ length: Math.min(concurrency, script.scenes.length - i) }, (_, j) => i + j)
    );
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const scene = script.scenes[i];
        const imagePrompt = scene.imagePrompt || scene.visualDescription;
        const videoPrompt = `${scene.visualDescription}. Cinematic, ${seriesRecord.style} style, smooth camera motion, dramatic lighting.`;

        console.log(`Scene ${i}: Generating DALL-E image...`);
        const dalleImage = await generateImage(imagePrompt);
        if (!dalleImage) {
          throw new Error(
            `Could not generate DALL-E image for scene ${i}. Check OpenAI API key.`
          );
        }

        const imagePath = path.join(workDir, `ai_img_${i}.jpg`);
        await downloadFile(dalleImage.url, imagePath);

        console.log(`Scene ${i}: Uploading image to fal.ai...`);
        const falImageUrl = await uploadImageForFal(imagePath);

        console.log(`Scene ${i}: Generating AI video clip...`);
        const clipDuration: "5" | "10" = scene.duration >= 10 ? "10" : "5";
        const videoResult = await getAIVideoForScene(falImageUrl, videoPrompt, clipDuration);

        const videoPath = path.join(workDir, `media_${i}.mp4`);
        await downloadAIVideo(videoResult.videoUrl, videoPath);

        console.log(`Scene ${i}: AI video clip ready`);
        mediaPaths[i] = { path: videoPath, type: "video" };
      })
    );
  }

  return mediaPaths;
}

export async function generateScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    console.log(`Script generation starting for series=${seriesId}`);
    await updateVideoStatus(videoProjectId, "GENERATING_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea =
      topicIdeas.length > 0
        ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
        : undefined;

    const script = await generateVideoScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea
    );

    await db
      .update(schema.videoProjects)
      .set({
        title: script.title,
        script: JSON.stringify(script),
        duration: script.totalDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (let i = 0; i < script.scenes.length; i++) {
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: script.scenes[i].text,
        duration: script.scenes[i].duration,
      });
    }

    await updateVideoStatus(videoProjectId, "REVIEW");
    await updateJobStep(videoProjectId, "SCRIPT", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Script ready for review: ${script.title} (${script.scenes.length} scenes)`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Script generation failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    await db
      .update(schema.renderJobs)
      .set({ status: "FAILED", error: errorMessage })
      .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
    throw error;
  }
}

export async function renderFromScenesJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-render-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  resetUsedMedia();

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoType = seriesRecord.videoType || "faceless";

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes to render");

    const scriptJson = (await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { script: true },
    }))?.script;

    const script = scriptJson ? JSON.parse(scriptJson) : null;

    console.log(`Render from scenes starting: type=${videoType}, ${existingScenes.length} scenes`);

    await updateVideoStatus(videoProjectId, "GENERATING_ASSETS");
    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 10);
    await job.updateProgress(10);

    const sceneTexts = existingScenes.map((s) => s.text);

    const ttsPromise = generateTTSParallel(
      sceneTexts,
      seriesRecord.defaultVoiceId ?? undefined,
      workDir
    );

    const mediaPromise = (async () => {
      if (videoType === "ai_video" && script) {
        return fetchAIVideoMediaParallel(script, seriesRecord, workDir);
      }
      const fakeScript = {
        scenes: existingScenes.map((s, i) => ({
          text: s.text,
          visualDescription: script?.scenes?.[i]?.visualDescription || s.text,
          searchQuery: script?.scenes?.[i]?.searchQuery || s.text.split(" ").slice(0, 4).join(" "),
          imagePrompt: script?.scenes?.[i]?.imagePrompt || s.text,
          duration: s.duration ?? 5,
        })),
      };
      return fetchFacelessMediaParallel(fakeScript as any, seriesRecord, workDir);
    })();

    const [ttsResult, mediaPaths] = await Promise.all([ttsPromise, mediaPromise]);
    const { audioPaths, ttsResults } = ttsResult;

    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 60);
    await job.updateProgress(60);

    await Promise.all(
      sceneTexts.map(async (_, i) => {
        const audioBuffer = await fs.readFile(audioPaths[i]);
        const audioKey = `scenes/${videoProjectId}/audio_${i}.mp3`;
        await uploadFile(audioKey, audioBuffer, "audio/mpeg");

        const mediaBuffer = await fs.readFile(mediaPaths[i].path);
        const mediaExt = mediaPaths[i].type === "video" ? "mp4" : "jpg";
        const mediaMime = mediaPaths[i].type === "video" ? "video/mp4" : "image/jpeg";
        const mediaKey = `scenes/${videoProjectId}/media_${i}.${mediaExt}`;
        await uploadFile(mediaKey, mediaBuffer, mediaMime);

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: audioKey,
            assetUrl: mediaKey,
            assetType: mediaPaths[i].type,
            captionData: ttsResults[i].wordTimestamps,
            duration: existingScenes[i].duration,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));
      })
    );

    await job.updateProgress(70);

    await updateVideoStatus(videoProjectId, "RENDERING");
    await updateJobStep(videoProjectId, "COMPOSE", "ACTIVE", 75);
    await job.updateProgress(75);

    const composerScenes: ComposerScene[] = sceneTexts.map((text, i) => ({
      audioPath: audioPaths[i],
      mediaPath: mediaPaths[i].path,
      mediaType: mediaPaths[i].type,
      text,
      duration: existingScenes[i].duration ?? 5,
      wordTimestamps: ttsResults[i].wordTimestamps,
    }));

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
    });

    await job.updateProgress(90);

    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `videos/${userId}/${videoProjectId}/output.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    const totalDuration = composerScenes.reduce((s, sc) => s + sc.duration, 0);
    await db
      .update(schema.videoProjects)
      .set({ duration: Math.round(totalDuration) })
      .where(eq(schema.videoProjects.id, videoProjectId));

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });
    await updateJobStep(videoProjectId, "DONE", "COMPLETED", 100);
    await job.updateProgress(100);

    await recordUsage(userId, "video_generated", 1, {
      videoProjectId,
      duration: totalDuration,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Render from scenes failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    await db
      .update(schema.renderJobs)
      .set({ status: "FAILED", error: errorMessage })
      .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}

export async function renderVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-render-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  resetUsedMedia();

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });

    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoType = seriesRecord.videoType || "faceless";
    console.log(`Render job starting: type=${videoType}, series=${seriesId}`);

    // Step 1: Generate Script
    await updateVideoStatus(videoProjectId, "GENERATING_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea =
      topicIdeas.length > 0
        ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
        : undefined;

    const script = await generateVideoScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea
    );

    await db
      .update(schema.videoProjects)
      .set({
        title: script.title,
        script: JSON.stringify(script),
        duration: script.totalDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    const sceneIds: string[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const [inserted] = await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: script.scenes[i].text,
        duration: script.scenes[i].duration,
      }).returning({ id: schema.videoScenes.id });
      sceneIds.push(inserted.id);
    }

    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 25);
    await job.updateProgress(25);

    // Step 2 + 3: Generate TTS and Media in parallel
    await updateVideoStatus(videoProjectId, "GENERATING_ASSETS");
    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 30);
    await job.updateProgress(30);

    const sceneTexts = script.scenes.map((s) => s.text);

    const ttsPromise = generateTTSParallel(
      sceneTexts,
      seriesRecord.defaultVoiceId ?? undefined,
      workDir
    );

    const mediaPromise = videoType === "ai_video"
      ? fetchAIVideoMediaParallel(script, seriesRecord, workDir)
      : fetchFacelessMediaParallel(script, seriesRecord, workDir);

    const [ttsResult, mediaPaths] = await Promise.all([ttsPromise, mediaPromise]);

    const { audioPaths, ttsResults } = ttsResult;

    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 70);
    await job.updateProgress(70);

    // Step 3.5: Upload individual scene assets to R2 for editor
    await Promise.all(
      sceneTexts.map(async (_, i) => {
        const audioBuffer = await fs.readFile(audioPaths[i]);
        const audioKey = `scenes/${videoProjectId}/audio_${i}.mp3`;
        await uploadFile(audioKey, audioBuffer, "audio/mpeg");

        const mediaBuffer = await fs.readFile(mediaPaths[i].path);
        const mediaExt = mediaPaths[i].type === "video" ? "mp4" : "jpg";
        const mediaMime = mediaPaths[i].type === "video" ? "video/mp4" : "image/jpeg";
        const mediaKey = `scenes/${videoProjectId}/media_${i}.${mediaExt}`;
        await uploadFile(mediaKey, mediaBuffer, mediaMime);

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: audioKey,
            assetUrl: mediaKey,
            assetType: mediaPaths[i].type,
            captionData: ttsResults[i].wordTimestamps,
          })
          .where(eq(schema.videoScenes.id, sceneIds[i]));
      })
    );

    await job.updateProgress(73);

    // Step 4: Compose Video with word-synced captions
    await updateVideoStatus(videoProjectId, "RENDERING");
    await updateJobStep(videoProjectId, "COMPOSE", "ACTIVE", 75);
    await job.updateProgress(75);

    const composerScenes: ComposerScene[] = sceneTexts.map((text, i) => ({
      audioPath: audioPaths[i],
      mediaPath: mediaPaths[i].path,
      mediaType: mediaPaths[i].type,
      text,
      duration: script.scenes[i].duration,
      wordTimestamps: ttsResults[i].wordTimestamps,
    }));

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
    });

    await job.updateProgress(90);

    // Step 5: Upload to S3/R2
    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `videos/${userId}/${videoProjectId}/output.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });
    await updateJobStep(videoProjectId, "DONE", "COMPLETED", 100);
    await job.updateProgress(100);

    await recordUsage(userId, "video_generated", 1, {
      videoProjectId,
      duration: script.totalDuration,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Render job failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    await db
      .update(schema.renderJobs)
      .set({ status: "FAILED", error: errorMessage })
      .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}

export async function rerenderVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-rerender-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const scenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (scenes.length === 0) throw new Error("No scenes to re-render");

    console.log(`Re-render starting: ${scenes.length} scenes for ${videoProjectId}`);
    await updateVideoStatus(videoProjectId, "RENDERING");
    await job.updateProgress(10);

    const composerScenes: ComposerScene[] = await Promise.all(
      scenes.map(async (scene, i) => {
        const audioPath = path.join(workDir, `audio_${i}.mp3`);
        const ext = scene.assetType === "video" ? "mp4" : "jpg";
        const mediaPath = path.join(workDir, `media_${i}.${ext}`);

        const [audioUrl, assetUrl] = await Promise.all([
          scene.audioUrl ? getSignedDownloadUrl(scene.audioUrl) : null,
          scene.assetUrl ? getSignedDownloadUrl(scene.assetUrl) : null,
        ]);

        if (audioUrl) await downloadFile(audioUrl, audioPath);
        if (assetUrl) await downloadFile(assetUrl, mediaPath);

        return {
          audioPath,
          mediaPath,
          mediaType: (scene.assetType || "image") as "video" | "image",
          text: scene.text,
          duration: scene.duration ?? 5,
          wordTimestamps: (scene.captionData as { word: string; start: number; end: number }[]) || [],
        };
      })
    );

    await job.updateProgress(50);

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
    });

    await job.updateProgress(85);

    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `videos/${userId}/${videoProjectId}/output.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    const totalDuration = composerScenes.reduce((s, sc) => s + sc.duration, 0);
    await db
      .update(schema.videoProjects)
      .set({ duration: Math.round(totalDuration) })
      .where(eq(schema.videoProjects.id, videoProjectId));

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });
    await job.updateProgress(100);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Re-render failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
