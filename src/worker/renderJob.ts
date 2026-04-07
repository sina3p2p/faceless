import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, and, ne, desc } from "drizzle-orm";
import * as schema from "@/server/db/schema";
import { DATABASE } from "@/lib/constants";
import { generateVideoScript, generateMusicScript, type MusicScript } from "@/server/services/llm";
import { generateSong, splitSongIntoSections, transcribeSong, alignLyricsToTranscription, splitSongAligned } from "@/server/services/music";
import { generateSpeech, type TTSResult } from "@/server/services/tts";
import {
  getMediaForScene,
  generateImage,
  generateFluxImage,
  generateNanoBananaImage,
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

const client = postgres(DATABASE.url);
const db = drizzle(client, { schema });

async function getPreviousTopics(seriesId: string, currentVideoId: string): Promise<string[]> {
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

interface CharacterRef {
  url: string;
  description: string;
}

async function resolveCharacterRefs(
  characterImages: Array<{ url: string; description: string }> | null | undefined
): Promise<CharacterRef[]> {
  if (!characterImages || characterImages.length === 0) return [];
  return Promise.all(
    characterImages.map(async (c) => ({
      url: c.url.startsWith("http") ? c.url : await getSignedDownloadUrl(c.url),
      description: c.description,
    }))
  );
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

type PreApproved = Map<number, { path: string; type: "video" | "image" }>;

type ScriptInput = Pick<Awaited<ReturnType<typeof generateVideoScript>>, "scenes">;

async function reusePreApprovedImages(
  scenes: Array<{ assetUrl?: string | null; assetType?: string | null }>,
  workDir: string
): Promise<PreApproved> {
  const result: PreApproved = new Map();
  await Promise.all(
    scenes.map(async (scene, i) => {
      if (!scene.assetUrl) return;
      try {
        const signedUrl = await getSignedDownloadUrl(scene.assetUrl);
        const ext = scene.assetType === "video" ? "mp4" : "jpg";
        const localPath = path.join(workDir, `media_${i}.${ext}`);
        await downloadFile(signedUrl, localPath);
        result.set(i, { path: localPath, type: (scene.assetType as "video" | "image") || "image" });
        console.log(`Scene ${i}: Reusing pre-approved ${scene.assetType || "image"}`);
      } catch (err) {
        console.warn(`Scene ${i}: Could not reuse pre-approved asset, will regenerate:`, err);
      }
    })
  );
  return result;
}

async function fetchFacelessMediaParallel(
  script: ScriptInput,
  seriesRecord: { niche: string; style: string; imageModel?: string | null; characterRefs?: CharacterRef[] },
  workDir: string,
  concurrency = 3,
  preApproved: PreApproved = new Map()
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
        if (preApproved.has(i)) {
          mediaPaths[i] = preApproved.get(i)!;
          return;
        }

        const scene = script.scenes[i];
        const searchQuery = scene.searchQuery || scene.visualDescription;
        const imagePrompt = scene.imagePrompt || scene.visualDescription;

        const imgModel = seriesRecord.imageModel || "dall-e-3";
        const refs = seriesRecord.characterRefs?.length ? seriesRecord.characterRefs : undefined;
        const asset = await getMediaForScene(searchQuery, imagePrompt, true, imgModel, refs);

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

async function generateSceneImage(
  imagePrompt: string,
  imageModel: string,
  sceneIndex: number,
  characterRefs?: CharacterRef[]
): Promise<MediaAsset> {
  console.log(`Scene ${sceneIndex}: Generating image with ${imageModel}${characterRefs?.length ? ` with ${characterRefs.length} character ref(s)` : ""}...`);

  let result: MediaAsset | null = null;
  if (imageModel === "nano-banana-2") {
    result = await generateNanoBananaImage(imagePrompt, characterRefs);
  } else if (imageModel === "flux-pro") {
    result = await generateFluxImage(imagePrompt);
  } else {
    result = await generateImage(imagePrompt);
  }

  if (!result) {
    throw new Error(`${imageModel} failed to generate image for scene ${sceneIndex}. The job will fail — you can retry or switch to a different model in series settings.`);
  }
  return result;
}

async function fetchAIVideoMediaParallel(
  script: ScriptInput,
  seriesRecord: { niche: string; style: string; imageModel?: string | null; videoModel?: string | null; sceneContinuity?: number; characterRefs?: CharacterRef[] },
  workDir: string,
  concurrency = 2,
  preApproved: PreApproved = new Map()
): Promise<{ path: string; type: "video" | "image" }[]> {
  const mediaPaths: { path: string; type: "video" | "image" }[] = new Array(script.scenes.length);
  const imageModel = seriesRecord.imageModel || "dall-e-3";
  const continuity = !!seriesRecord.sceneContinuity;
  const charRefs = seriesRecord.characterRefs?.length ? seriesRecord.characterRefs : undefined;

  // Phase 1: Generate/collect all scene images first (needed for continuity pairs)
  const sceneImagePaths: string[] = new Array(script.scenes.length);
  const imgChunks: number[][] = [];
  for (let i = 0; i < script.scenes.length; i += concurrency) {
    imgChunks.push(
      Array.from({ length: Math.min(concurrency, script.scenes.length - i) }, (_, j) => i + j)
    );
  }

  for (const chunk of imgChunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const scene = script.scenes[i];
        const imagePrompt = scene.imagePrompt || scene.visualDescription;
        const imagePath = path.join(workDir, `ai_img_${i}.jpg`);

        if (preApproved.has(i)) {
          const approved = preApproved.get(i)!;
          if (approved.type === "image") {
            await fs.copyFile(approved.path, imagePath);
            console.log(`Scene ${i}: Using pre-approved image`);
          }
        } else {
          const generatedImage = await generateSceneImage(imagePrompt, imageModel, i, charRefs);
          await downloadFile(generatedImage.url, imagePath);
        }

        sceneImagePaths[i] = imagePath;
      })
    );
  }

  // Phase 2: Upload all images to fal.ai
  const falImageUrls: string[] = new Array(script.scenes.length);
  for (const chunk of imgChunks) {
    await Promise.all(
      chunk.map(async (i) => {
        console.log(`Scene ${i}: Uploading image to fal.ai...`);
        falImageUrls[i] = await uploadImageForFal(sceneImagePaths[i]);
      })
    );
  }

  // Phase 3: Generate video clips (with end-frame pairs when continuity is on)
  const vidChunks: number[][] = [];
  for (let i = 0; i < script.scenes.length; i += concurrency) {
    vidChunks.push(
      Array.from({ length: Math.min(concurrency, script.scenes.length - i) }, (_, j) => i + j)
    );
  }

  for (const chunk of vidChunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const scene = script.scenes[i];
        const videoPrompt = `${scene.visualDescription}. Cinematic, ${seriesRecord.style} style, smooth camera motion, dramatic lighting.`;
        const videoModelKey = seriesRecord.videoModel || undefined;
        const clipDuration: "5" | "10" = scene.duration >= 7 ? "10" : "5";

        const startImageUrl = falImageUrls[i];
        const endImageUrl = continuity && i < script.scenes.length - 1
          ? falImageUrls[i + 1]
          : undefined;

        console.log(`Scene ${i}: Generating AI video clip (${videoModelKey || "default"})${endImageUrl ? " → scene " + (i + 1) : ""}${charRefs ? ` +${charRefs.length}chars` : ""}...`);
        const videoResult = await getAIVideoForScene(startImageUrl, videoPrompt, clipDuration, videoModelKey, endImageUrl, charRefs);

        const videoPath = path.join(workDir, `media_${i}.mp4`);
        await downloadAIVideo(videoResult.videoUrl, videoPath);

        console.log(`Scene ${i}: AI video clip ready (image: ${imageModel})`);
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

    const previousTopics = await getPreviousTopics(seriesId, videoProjectId);

    const script = await generateVideoScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea,
      45,
      seriesRecord.llmModel || undefined,
      !!seriesRecord.sceneContinuity,
      previousTopics,
      seriesRecord.language || "en"
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
        imagePrompt: script.scenes[i].imagePrompt,
        visualDescription: script.scenes[i].visualDescription,
        searchQuery: script.scenes[i].searchQuery,
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
    const seriesRecordRaw = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecordRaw) throw new Error(`Series not found: ${seriesId}`);

    const characterRefs = await resolveCharacterRefs(seriesRecordRaw.characterImages as Array<{ url: string; description: string }> | null);
    const seriesRecord = { ...seriesRecordRaw, characterRefs };

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
      const sceneScript = {
        scenes: existingScenes.map((s, i) => ({
          text: s.text,
          visualDescription: s.visualDescription || script?.scenes?.[i]?.visualDescription || s.text,
          searchQuery: s.searchQuery || script?.scenes?.[i]?.searchQuery || s.text.split(" ").slice(0, 4).join(" "),
          imagePrompt: s.imagePrompt || script?.scenes?.[i]?.imagePrompt || s.text,
          duration: s.duration ?? 5,
        })),
      };

      const preApproved = await reusePreApprovedImages(existingScenes, workDir);

      if (videoType === "ai_video") {
        return fetchAIVideoMediaParallel(sceneScript, seriesRecord, workDir, 2, preApproved);
      }
      return fetchFacelessMediaParallel(sceneScript, seriesRecord, workDir, 3, preApproved);
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

        const sceneUpdates: Record<string, unknown> = {
            audioUrl: audioKey,
            assetUrl: mediaKey,
            assetType: mediaPaths[i].type,
            captionData: ttsResults[i].wordTimestamps,
            duration: existingScenes[i].duration,
        };
        if (!existingScenes[i].modelUsed) {
          sceneUpdates.modelUsed = seriesRecord.imageModel || "dall-e-3";
        }
        await db
          .update(schema.videoScenes)
          .set(sceneUpdates)
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
      sceneContinuity: !!seriesRecord.sceneContinuity,
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
    const seriesRecordRaw = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });

    if (!seriesRecordRaw) throw new Error(`Series not found: ${seriesId}`);

    const characterRefs = await resolveCharacterRefs(seriesRecordRaw.characterImages as Array<{ url: string; description: string }> | null);
    const seriesRecord = { ...seriesRecordRaw, characterRefs };

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

    const previousTopics = await getPreviousTopics(seriesId, videoProjectId);

    const script = await generateVideoScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea,
      45,
      seriesRecord.llmModel || undefined,
      !!seriesRecord.sceneContinuity,
      previousTopics,
      seriesRecord.language || "en"
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
            modelUsed: seriesRecord.imageModel || "dall-e-3",
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
      sceneContinuity: !!seriesRecord.sceneContinuity,
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
      sceneContinuity: !!seriesRecord.sceneContinuity,
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

export async function generateMusicScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    console.log(`Music script generation starting for series=${seriesId}`);
    await updateVideoStatus(videoProjectId, "GENERATING_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea =
      topicIdeas.length > 0
        ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
        : undefined;

    const previousTopics = await getPreviousTopics(seriesId, videoProjectId);

    const musicScript = await generateMusicScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea,
      60,
      seriesRecord.llmModel || undefined,
      previousTopics,
      seriesRecord.language || "en"
    );

    await db
      .update(schema.videoProjects)
      .set({
        title: musicScript.title,
        script: JSON.stringify(musicScript),
        duration: musicScript.totalDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (let i = 0; i < musicScript.sections.length; i++) {
      const section = musicScript.sections[i];
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: section.lyrics.join("\n"),
        imagePrompt: section.imagePrompt,
        visualDescription: section.visualDescription,
        searchQuery: section.sectionName,
        duration: Math.round(section.durationMs / 1000),
      });
    }

    await updateVideoStatus(videoProjectId, "REVIEW");
    await updateJobStep(videoProjectId, "SCRIPT", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Music script ready for review: ${musicScript.title} (${musicScript.sections.length} sections)`);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Music script generation failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    await db
      .update(schema.renderJobs)
      .set({ status: "FAILED", error: errorMessage })
      .where(eq(schema.renderJobs.videoProjectId, videoProjectId));
    throw error;
  }
}

export async function renderMusicVideoJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-music-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  resetUsedMedia();

  try {
    const seriesRecordRaw = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecordRaw) throw new Error(`Series not found: ${seriesId}`);

    const characterRefs = await resolveCharacterRefs(seriesRecordRaw.characterImages as Array<{ url: string; description: string }> | null);
    const seriesRecord = { ...seriesRecordRaw, characterRefs };

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes to render");

    const scriptJson = (await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { script: true },
    }))?.script;

    const musicScript: MusicScript | null = scriptJson ? JSON.parse(scriptJson) : null;
    if (!musicScript) throw new Error("No music script found");

    console.log(`Music video render starting: ${existingScenes.length} sections`);

    await updateVideoStatus(videoProjectId, "GENERATING_ASSETS");
    await updateJobStep(videoProjectId, "TTS", "ACTIVE", 10);
    await job.updateProgress(10);

    const sectionsForMusic = musicScript.sections.map((s, i) => ({
      ...s,
      lyrics: existingScenes[i] ? existingScenes[i].text.split("\n") : s.lyrics,
      durationMs: (existingScenes[i]?.duration ?? Math.round(s.durationMs / 1000)) * 1000,
    }));

    const songResult = await generateSong(
      musicScript.title,
      musicScript.genre,
      sectionsForMusic
    );

    const songPath = path.join(workDir, "full_song.mp3");
    await downloadFile(songResult.audioUrl, songPath);

    console.log("Full song generated and downloaded");
    await job.updateProgress(25);

    // Whisper transcription for lyrics alignment
    let alignedSections;
    try {
      const whisperWords = await transcribeSong(songResult.audioUrl);
      const totalDurationMs = Math.round(songResult.duration * 1000);
      alignedSections = alignLyricsToTranscription(sectionsForMusic, whisperWords, totalDurationMs);
      console.log(`[music] Whisper alignment successful: ${alignedSections.length} sections aligned`);
    } catch (err) {
      console.warn(`[music] Whisper alignment failed, falling back to proportional split: ${err instanceof Error ? err.message : err}`);
      alignedSections = null;
    }

    await job.updateProgress(30);

    let sectionAudioPaths: string[];
    let actualDurationsMs: number[];

    if (alignedSections) {
      const splitResult = await splitSongAligned(songPath, alignedSections, workDir);
      sectionAudioPaths = splitResult.audioPaths;
      actualDurationsMs = splitResult.actualDurationsMs;
    } else {
      const splitResult = await splitSongIntoSections(songPath, sectionsForMusic, workDir);
      sectionAudioPaths = splitResult.audioPaths;
      actualDurationsMs = splitResult.actualDurationsMs;
    }

    const actualDurationsSec = actualDurationsMs.map((ms) => Math.round(ms / 1000));

    await job.updateProgress(35);

    await updateJobStep(videoProjectId, "MEDIA", "ACTIVE", 40);

    const preApproved = await reusePreApprovedImages(existingScenes, workDir);

    const sceneScript = {
      scenes: existingScenes.map((s, i) => ({
        text: s.text,
        visualDescription: s.visualDescription || musicScript.sections[i]?.visualDescription || s.text,
        searchQuery: s.searchQuery || musicScript.sections[i]?.sectionName || "cinematic",
        imagePrompt: s.imagePrompt || musicScript.sections[i]?.imagePrompt || s.text,
        duration: actualDurationsSec[i] ?? s.duration ?? 5,
      })),
    };

    let mediaPaths: { path: string; type: "video" | "image" }[];
    if (seriesRecord.videoModel && seriesRecord.videoModel !== "none") {
      mediaPaths = await fetchAIVideoMediaParallel(sceneScript, seriesRecord, workDir, 2, preApproved);
    } else {
      mediaPaths = await fetchFacelessMediaParallel(sceneScript, seriesRecord, workDir, 3, preApproved);
    }

    await job.updateProgress(65);

    await Promise.all(
      existingScenes.map(async (scene, i) => {
        const audioBuffer = await fs.readFile(sectionAudioPaths[i]);
        const audioKey = `scenes/${videoProjectId}/audio_${i}.mp3`;
        await uploadFile(audioKey, audioBuffer, "audio/mpeg");

        const mediaBuffer = await fs.readFile(mediaPaths[i].path);
        const mediaExt = mediaPaths[i].type === "video" ? "mp4" : "jpg";
        const mediaMime = mediaPaths[i].type === "video" ? "video/mp4" : "image/jpeg";
        const mediaKey = `scenes/${videoProjectId}/media_${i}.${mediaExt}`;
        await uploadFile(mediaKey, mediaBuffer, mediaMime);

        const sectionWordTimestamps = alignedSections?.[i]?.wordTimestamps || [];

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: audioKey,
            assetUrl: mediaKey,
            assetType: mediaPaths[i].type,
            duration: actualDurationsSec[i] ?? existingScenes[i].duration,
            captionData: sectionWordTimestamps.length > 0 ? sectionWordTimestamps : null,
            modelUsed: seriesRecord.imageModel || "dall-e-3",
          })
          .where(eq(schema.videoScenes.id, scene.id));
      })
    );

    await job.updateProgress(70);

    await updateVideoStatus(videoProjectId, "RENDERING");
    await updateJobStep(videoProjectId, "COMPOSE", "ACTIVE", 75);

    const composerScenes: ComposerScene[] = existingScenes.map((scene, i) => ({
      audioPath: sectionAudioPaths[i],
      mediaPath: mediaPaths[i].path,
      mediaType: mediaPaths[i].type,
      text: scene.text.split("\n").join(" "),
      duration: actualDurationsSec[i] ?? scene.duration ?? 5,
      wordTimestamps: alignedSections?.[i]?.wordTimestamps || [],
    }));

    const outputPath = await composeVideo({
      scenes: composerScenes,
      captionStyle: seriesRecord.captionStyle,
      sceneContinuity: !!seriesRecord.sceneContinuity,
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
    console.error(`Music video render failed for ${videoProjectId}:`, errorMessage);
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
