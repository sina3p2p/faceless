import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { MEDIA, AI_VIDEO } from "@/lib/constants";

const PEXELS_API_KEY = MEDIA.pexelsApiKey;
const openai = new OpenAI({ apiKey: MEDIA.openaiApiKey });

fal.config({ credentials: AI_VIDEO.falKey });

export interface MediaAsset {
  url: string;
  type: "video" | "image";
  source: "pexels" | "openai" | "kling" | "nano-banana";
  width: number;
  height: number;
}

const usedPexelsIds = new Set<number>();

export function resetUsedMedia(): void {
  usedPexelsIds.clear();
}

export type AspectRatio = "9:16" | "16:9" | "1:1";

function orientationForAspect(ar: AspectRatio): "portrait" | "landscape" {
  return ar === "16:9" ? "landscape" : "portrait";
}

function dalleSize(ar: AspectRatio): "1024x1792" | "1792x1024" | "1024x1024" {
  if (ar === "16:9") return "1792x1024";
  if (ar === "1:1") return "1024x1024";
  return "1024x1792";
}

function dalleDimensions(ar: AspectRatio): { width: number; height: number } {
  if (ar === "16:9") return { width: 1792, height: 1024 };
  if (ar === "1:1") return { width: 1024, height: 1024 };
  return { width: 1024, height: 1792 };
}

function fallbackDimensions(ar: AspectRatio): { width: number; height: number } {
  if (ar === "16:9") return { width: 1344, height: 768 };
  if (ar === "1:1") return { width: 1024, height: 1024 };
  return { width: 768, height: 1344 };
}

function compositionSuffix(ar: AspectRatio): string {
  if (ar === "16:9") return "Landscape 16:9 composition";
  if (ar === "1:1") return "Square 1:1 composition";
  return "Vertical 9:16 composition";
}

export async function searchStockVideo(
  query: string,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<MediaAsset | null> {
  try {
    const response = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(
        query
      )}&orientation=${orientation}&size=medium&per_page=15`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const videos = data.videos ?? [];

    for (const video of videos) {
      if (usedPexelsIds.has(video.id)) continue;

      const file =
        video.video_files?.find(
          (f: { quality: string; width: number }) =>
            f.quality === "hd" && f.width >= 720
        ) ?? video.video_files?.[0];

      if (!file) continue;

      usedPexelsIds.add(video.id);
      return {
        url: file.link,
        type: "video",
        source: "pexels",
        width: file.width,
        height: file.height,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function searchStockImage(
  query: string,
  orientation: "portrait" | "landscape" = "portrait"
): Promise<MediaAsset | null> {
  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(
        query
      )}&orientation=${orientation}&size=large&per_page=15`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const photos = data.photos ?? [];

    for (const photo of photos) {
      if (usedPexelsIds.has(photo.id)) continue;

      usedPexelsIds.add(photo.id);
      return {
        url: photo.src.large2x || photo.src.large,
        type: "image",
        source: "pexels",
        width: photo.width,
        height: photo.height,
      };
    }

    return null;
  } catch {
    return null;
  }
}

export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  try {
    const dims = dalleDimensions(aspectRatio);
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt: `${prompt}. ${compositionSuffix(aspectRatio)}, cinematic lighting, photorealistic, no text or watermarks.`,
      n: 1,
      size: dalleSize(aspectRatio),
    });

    const url = response.data?.[0]?.url;
    if (!url) return null;

    return {
      url,
      type: "image",
      source: "openai",
      width: dims.width,
      height: dims.height,
    };
  } catch {
    return null;
  }
}

export async function generateKlingImage(
  prompt: string,
  referenceImageUrl?: string,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: any[] = [];

    if (referenceImageUrl) {
      elements.push({ reference_image_urls: [referenceImageUrl] });
    }
    if (characterRefs && characterRefs.length > 0) {
      for (const ref of characterRefs) {
        elements.push({ reference_image_urls: [ref.url] });
      }
    }

    const elementRefs = elements.length > 0
      ? ` ${elements.map((_, i) => `@Element${i + 1}`).join(" ")}`
      : "";

    const fb = fallbackDimensions(aspectRatio);

    const result = await fal.subscribe(AI_VIDEO.klingImageModel, {
      input: {
        prompt: `${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks.${elementRefs}`,
        ...(elements.length > 0 ? { elements } : {}),
        aspect_ratio: aspectRatio,
        num_images: 1,
        output_format: "jpeg",
      },
      logs: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const data = result.data as { images?: Array<{ url: string; width: number; height: number }> };
    const image = data?.images?.[0];
    if (!image?.url) return null;

    return { url: image.url, type: "image", source: "kling", width: image.width || fb.width, height: image.height || fb.height };
  } catch (err) {
    const detail = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`Kling image generation failed:`, detail);
    return null;
  }
}

export interface CharacterRef {
  url: string;
  description: string;
}

export async function generateNanoBananaImage(
  prompt: string,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  const hasRefs = characterRefs && characterRefs.length > 0;
  const fb = fallbackDimensions(aspectRatio);

  try {
    const modelId = hasRefs
      ? `${AI_VIDEO.nanoBananaModel}/edit`
      : AI_VIDEO.nanoBananaModel;

    const charContext = hasRefs
      ? ` Characters in scene: ${characterRefs.map((c, i) => `[Character ${i + 1}: ${c.description || "reference image"}]`).join(", ")}. Keep all characters consistent with their reference images.`
      : "";

    const input: Record<string, unknown> = {
      prompt: `${prompt}.${charContext} ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
      aspect_ratio: aspectRatio,
      output_format: "jpeg",
      resolution: "1K",
      num_images: 1,
      safety_tolerance: "6",
    };

    if (hasRefs) {
      input.image_urls = characterRefs.map((c) => c.url);
    }

    const result = await fal.subscribe(modelId, {
      input,
      logs: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const data = result.data as { images?: Array<{ url: string; width?: number; height?: number }> };
    const image = data?.images?.[0];
    if (!image?.url) return null;

    return {
      url: image.url,
      type: "image",
      source: "nano-banana",
      width: image.width || fb.width,
      height: image.height || fb.height,
    };
  } catch (err) {
    console.warn(`Nano Banana 2 image generation failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function generateAnyImage(
  prompt: string,
  imageModel = "dall-e-3",
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  if (imageModel === "nano-banana-2") {
    return generateNanoBananaImage(prompt, characterRefs, aspectRatio);
  }
  if (imageModel === "kling-image-v3") {
    return generateKlingImage(prompt, undefined, characterRefs, aspectRatio);
  }
  return generateImage(prompt, aspectRatio);
}

export async function getMediaForScene(
  searchQuery: string,
  imagePrompt: string,
  preferAiImage = false,
  imageModel = "dall-e-3",
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset> {
  const orientation = orientationForAspect(aspectRatio);

  if (preferAiImage) {
    const generatedImage = await generateAnyImage(imagePrompt, imageModel, characterRefs, aspectRatio);
    if (generatedImage) return generatedImage;
  }

  const stockVideo = await searchStockVideo(searchQuery, orientation);
  if (stockVideo) return stockVideo;

  const stockImage = await searchStockImage(searchQuery, orientation);
  if (stockImage) return stockImage;

  const simplifiedQuery = searchQuery.split(" ").slice(0, 2).join(" ");
  if (simplifiedQuery !== searchQuery) {
    const fallbackVideo = await searchStockVideo(simplifiedQuery, orientation);
    if (fallbackVideo) return fallbackVideo;

    const fallbackImage = await searchStockImage(simplifiedQuery, orientation);
    if (fallbackImage) return fallbackImage;
  }

  const generatedImage = await generateAnyImage(imagePrompt, imageModel, characterRefs, aspectRatio);
  if (generatedImage) return generatedImage;

  throw new Error(
    `Could not find or generate media for query: "${searchQuery}"`
  );
}
