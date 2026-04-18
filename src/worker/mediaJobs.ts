import * as fs from "fs/promises";
import * as path from "path";

import {
  filterAssetsByRefs,
  type CharacterRef,
  type StoryAssetRef,
  type PreApproved,
  type ScriptInput,
} from "./shared";
import { WORKER } from "@/lib/constants";
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

export async function generateSceneImage(
  imagePrompt: string,
  imageModel: string,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset> {
  const result = await generateImage(imagePrompt, imageModel, characterRefs, aspectRatio);

  if (!result) {
    throw new Error(`${imageModel} failed to generate image. The job will fail — you can retry or switch to a different model in series settings.`);
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
          const generatedImage = await generateSceneImage(imagePrompt, imageModel, sceneRefs, aspectRatio);
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

