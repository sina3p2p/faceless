import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";

import {
  db,
  schema,
  eq,
  insertSceneMedia,
  updateVideoStatus,
  resolveStoryAssets,
  filterAssetsByRefs,
  parseStoryAssets,
  type CharacterRef,
  type StoryAssetRef,
  type StoryAssetInput,
  type PreApproved,
  type ScriptInput,
} from "./shared";
import { getVideoSize, WORKER } from "@/lib/constants";
import {
  getMediaForScene,
  generateImage,
  generateKlingImage,
  generateNanoBananaImage,
  type MediaAsset,
  type AspectRatio,
} from "@/server/services/media";
import {
  getAIVideoForScene,
  downloadAIVideo,
} from "@/server/services/ai-video";
import { downloadFile } from "@/server/services/composer";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import {
  generateImagePrompts,
  generateMotionDescriptions,
} from "@/server/services/llm";
import type { RenderJobData } from "@/lib/queue";

export async function fetchFacelessMediaParallel(
  script: ScriptInput,
  seriesRecord: { niche: string; style: string; imageModel?: string | null; characterRefs?: CharacterRef[] },
  workDir: string,
  concurrency = WORKER.parallelFacelessMedia,
  preApproved: PreApproved = new Map(),
  aspectRatio: AspectRatio = "9:16"
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
        const imagePrompt = scene.imagePrompt || scene.visualDescription;

        const imgModel = seriesRecord.imageModel || "dall-e-3";
        const refs = seriesRecord.characterRefs?.length ? seriesRecord.characterRefs : undefined;
        const asset = await getMediaForScene(imagePrompt, true, imgModel, refs, aspectRatio);

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

export async function generateSceneImage(
  imagePrompt: string,
  imageModel: string,
  sceneIndex: number,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset> {
  console.log(`Scene ${sceneIndex}: Generating image with ${imageModel}${characterRefs?.length ? ` with ${characterRefs.length} character ref(s)` : ""}...`);

  let result: MediaAsset | null = null;
  if (imageModel === "nano-banana-2") {
    result = await generateNanoBananaImage(imagePrompt, characterRefs, aspectRatio);
  } else if (imageModel === "kling-image-v3") {
    result = await generateKlingImage(imagePrompt, undefined, characterRefs, aspectRatio);
  } else {
    result = await generateImage(imagePrompt, aspectRatio);
  }

  if (!result) {
    throw new Error(`${imageModel} failed to generate image for scene ${sceneIndex}. The job will fail — you can retry or switch to a different model in series settings.`);
  }
  return result;
}

export async function fetchAIVideoMediaParallel(
  script: ScriptInput & { sceneAssetRefs?: (string[] | null)[] },
  seriesRecord: { niche: string; style: string; imageModel?: string | null; videoModel?: string | null; sceneContinuity?: number; characterRefs?: CharacterRef[]; storyAssets?: StoryAssetRef[] },
  workDir: string,
  concurrency = WORKER.parallelVideos,
  preApprovedImages: PreApproved = new Map(),
  preApprovedVideos: PreApproved = new Map(),
  aspectRatio: AspectRatio = "9:16"
): Promise<{ path: string; type: "video" | "image" }[]> {
  const mediaPaths: { path: string; type: "video" | "image" }[] = new Array(script.scenes.length);
  const imageModel = seriesRecord.imageModel || "dall-e-3";
  const continuity = !!seriesRecord.sceneContinuity;
  const allAssets = seriesRecord.storyAssets ?? [];
  const charRefs = allAssets.length > 0 ? undefined : (seriesRecord.characterRefs?.length ? seriesRecord.characterRefs : undefined);

  const scenesNeedingVideo: number[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    if (preApprovedVideos.has(i)) {
      mediaPaths[i] = preApprovedVideos.get(i)!;
      console.log(`Scene ${i}: Skipping — already has video clip`);
    } else {
      scenesNeedingVideo.push(i);
    }
  }

  if (scenesNeedingVideo.length === 0) {
    console.log("[ai-video] All scenes already have video clips, skipping generation");
    return mediaPaths;
  }

  console.log(`[ai-video] ${scenesNeedingVideo.length}/${script.scenes.length} scenes need video generation`);

  // Phase 1: Generate/collect images for scenes that need video (+ neighbors for continuity)
  const sceneImageUrls: string[] = new Array(script.scenes.length);
  const scenesNeedingImage = new Set<number>();
  for (const i of scenesNeedingVideo) {
    scenesNeedingImage.add(i);
    if (continuity && i < script.scenes.length - 1) scenesNeedingImage.add(i + 1);
  }

  const imgList = Array.from(scenesNeedingImage).sort((a, b) => a - b);
  const imgChunks: number[][] = [];
  for (let j = 0; j < imgList.length; j += concurrency) {
    imgChunks.push(imgList.slice(j, j + concurrency));
  }

  for (const chunk of imgChunks) {
    await Promise.all(
      chunk.map(async (i) => {
        if (sceneImageUrls[i]) return;
        const scene = script.scenes[i];
        const imagePrompt = scene.imagePrompt || scene.visualDescription;
        const imagePath = path.join(workDir, `ai_img_${i}.jpg`);

        if (preApprovedImages.has(i)) {
          const approved = preApprovedImages.get(i)!;
          await fs.copyFile(approved.path, imagePath);
          sceneImageUrls[i] = approved.url;
          console.log(`Scene ${i}: Using existing image`);
        } else {
          const sceneRefs = allAssets.length > 0
            ? filterAssetsByRefs(allAssets, script.sceneAssetRefs?.[i] ?? null)
            : charRefs;
          const generatedImage = await generateSceneImage(imagePrompt, imageModel, i, sceneRefs, aspectRatio);
          sceneImageUrls[i] = generatedImage.url;
          await downloadFile(generatedImage.url, imagePath);
        }
      })
    );
  }

  // Phase 2: Generate video clips only for scenes that need them
  const vidChunks: number[][] = [];
  for (let j = 0; j < scenesNeedingVideo.length; j += concurrency) {
    vidChunks.push(scenesNeedingVideo.slice(j, j + concurrency));
  }

  for (const chunk of vidChunks) {
    await Promise.all(
      chunk.map(async (i) => {
        const scene = script.scenes[i];
        const videoPrompt = `${scene.visualDescription}. Cinematic, ${seriesRecord.style} style, smooth camera motion, dramatic lighting.`;
        const videoModelKey = seriesRecord.videoModel || undefined;
        const desiredDuration = Math.max(3, Math.round(scene.duration));

        const startImageUrl = sceneImageUrls[i];
        const endImageUrl = continuity && i < script.scenes.length - 1
          ? sceneImageUrls[i + 1]
          : undefined;

        console.log(`Scene ${i}: Generating AI video clip (${videoModelKey || "default"}, desired=${desiredDuration}s)${endImageUrl ? " → scene " + (i + 1) : ""}...`);
        const videoResult = await getAIVideoForScene(startImageUrl, videoPrompt, desiredDuration, videoModelKey, endImageUrl);

        const videoPath = path.join(workDir, `media_${i}.mp4`);
        await downloadAIVideo(videoResult.videoUrl, videoPath);

        console.log(`Scene ${i}: AI video clip ready (image: ${imageModel})`);
        mediaPaths[i] = { path: videoPath, type: "video" };
      })
    );
  }

  return mediaPaths;
}

export async function generateImagesJob(job: Job<RenderJobData & { regenerateExisting?: boolean }>) {
  const { videoProjectId, seriesId, regenerateExisting } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const allAssets = await resolveStoryAssets(
      seriesRecord.storyAssets as Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string }> | null,
      seriesRecord.characterImages as Array<{ url: string; description: string }> | null
    );

    const imageModel = seriesRecord.imageModel || "dall-e-3";
    const sizeConfig = getVideoSize(seriesRecord.videoSize);
    const ar = sizeConfig.id as AspectRatio;

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes to generate images for");

    const scenesWithoutPrompts = existingScenes.filter((s) => !s.imagePrompt);
    if (scenesWithoutPrompts.length > 0) {
      console.log(`[generate-images] ${scenesWithoutPrompts.length}/${existingScenes.length} scenes missing imagePrompts — running Image Agent`);

      const storyAssets = (seriesRecord.storyAssets ?? []) as StoryAssetInput[];
      const charImages = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
      const assets = parseStoryAssets(storyAssets, charImages);

      const narrationScenes = existingScenes.map((s) => ({
        text: s.text,
        duration: s.duration ?? 5,
        speaker: s.speaker ?? undefined,
        directorNote: s.directorNote ?? undefined,
        sceneTitle: s.sceneTitle ?? undefined,
      }));

      const result = await generateImagePrompts(
        narrationScenes,
        seriesRecord.niche,
        seriesRecord.style,
        assets,
        !!seriesRecord.sceneContinuity,
        seriesRecord.language || "en",
        seriesRecord.llmModel || undefined
      );

      for (let i = 0; i < existingScenes.length; i++) {
        const scenePrompt = result.scenes[i];
        if (!scenePrompt) continue;
        await db
          .update(schema.videoScenes)
          .set({
            imagePrompt: scenePrompt.imagePrompt,
            assetRefs: scenePrompt.assetRefs,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));
        existingScenes[i] = { ...existingScenes[i], imagePrompt: scenePrompt.imagePrompt };
      }
      console.log(`[generate-images] Image Agent generated ${result.scenes.length} prompts`);
    }

    const targets = regenerateExisting
      ? existingScenes
      : existingScenes.filter((s) => !s.imageUrl && !s.assetUrl);

    if (targets.length === 0) {
      console.log(`[generate-images] All scenes already have images, nothing to do`);
      await updateVideoStatus(videoProjectId, "IMAGE_REVIEW");
      return;
    }

    console.log(`[generate-images] Generating ${targets.length} images with ${imageModel} (parallel batches of ${WORKER.parallelImages}), ${allAssets.length} story assets`);

    const BATCH_SIZE = WORKER.parallelImages;
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (scene) => {
          const sceneIdx = existingScenes.findIndex((s) => s.id === scene.id);
          const prompt = scene.imagePrompt || scene.text;
          const sceneAssetRefs = scene.assetRefs as string[] | null;
          const sceneRefs = filterAssetsByRefs(allAssets, sceneAssetRefs);
          try {
            const result = await generateSceneImage(prompt, imageModel, sceneIdx, sceneRefs, ar);

            const imgResp = await fetch(result.url);
            if (!imgResp.ok) throw new Error("Failed to download generated image");
            const buffer = Buffer.from(await imgResp.arrayBuffer());

            const key = `scenes/${videoProjectId}/preview_${scene.id}_${Date.now()}.jpg`;
            await uploadFile(key, buffer, "image/jpeg");

            await db
              .update(schema.videoScenes)
              .set({ assetUrl: key, assetType: "image", imageUrl: key, modelUsed: imageModel })
              .where(eq(schema.videoScenes.id, scene.id));

            await insertSceneMedia(scene.id, "image", key, prompt, imageModel);
            console.log(`[generate-images] Scene ${sceneIdx} done`);
          } catch (err) {
            console.error(`[generate-images] Scene ${sceneIdx} failed:`, err);
            throw err;
          }
        })
      );

      const progress = Math.round(((i + batch.length) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    await updateVideoStatus(videoProjectId, "IMAGE_REVIEW");
    console.log(`[generate-images] All ${targets.length} images generated`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[generate-images] Failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    throw error;
  }
}

export async function generateMotionJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "VIDEO_SCRIPT");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes to generate motion for");

    console.log(`[generate-motion] Generating motion descriptions for ${existingScenes.length} scenes using vision model`);

    const scenes = existingScenes.map((s) => ({
      text: s.text,
      duration: s.duration ?? 5,
      imagePrompt: s.imagePrompt || s.text,
      directorNote: s.directorNote ?? undefined,
      sceneTitle: s.sceneTitle ?? undefined,
    }));

    const imageUrls: string[] = [];
    for (const scene of existingScenes) {
      const imageKey = scene.imageUrl || scene.assetUrl;
      if (imageKey) {
        try {
          const signedUrl = await getSignedDownloadUrl(imageKey);
          imageUrls.push(signedUrl);
        } catch {
          imageUrls.push("");
        }
      } else {
        imageUrls.push("");
      }
    }

    const result = await generateMotionDescriptions(
      scenes,
      seriesRecord.style,
      imageUrls,
      seriesRecord.llmModel || undefined
    );

    for (let i = 0; i < existingScenes.length; i++) {
      const motionScene = result.scenes[i];
      if (!motionScene) continue;
      await db
        .update(schema.videoScenes)
        .set({ visualDescription: motionScene.visualDescription })
        .where(eq(schema.videoScenes.id, existingScenes[i].id));
    }

    await updateVideoStatus(videoProjectId, "REVIEW_VISUAL");
    await job.updateProgress(100);

    console.log(`[generate-motion] Motion descriptions ready for review (${result.scenes.length} scenes)`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[generate-motion] Failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    throw error;
  }
}
