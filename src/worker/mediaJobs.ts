import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";

import {
  db,
  schema,
  eq,
  insertMedia,
  updateVideoStatus,
  failJob,
  resolveStoryAssets,
  filterAssetsByRefs,
  type CharacterRef,
  type StoryAssetRef,
  type PreApproved,
  type ScriptInput,
} from "./shared";
import { getVideoSize, WORKER } from "@/lib/constants";
import {
  type MediaAsset,
  type AspectRatio,
  generateImage,
} from "@/server/services/media";
import {
  getAIVideoForScene,
  downloadAIVideo,
} from "@/server/services/ai/video";
import { downloadFile } from "@/server/services/composer";
import { uploadFile } from "@/lib/storage";
import type { RenderJobData } from "@/lib/queue";

export async function generateSceneImage(
  imagePrompt: string,
  imageModel: string,
  sceneIndex: number,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset> {
  console.log(`Scene ${sceneIndex}: Generating image with ${imageModel}${characterRefs?.length ? ` with ${characterRefs.length} character ref(s)` : ""}...`);

  const result = await generateImage(imagePrompt, imageModel, characterRefs, aspectRatio);

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

            await insertMedia({ sceneId: scene.id }, "image", key, prompt, imageModel);
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
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-images] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

