import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { MEDIA, AI_VIDEO, LLM } from "@/lib/constants";

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

const GEMINI_IMAGE_MODEL = "google/gemini-3.1-flash-image-preview";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const ct = res.headers.get("content-type") || "image/jpeg";
    const mimeType = ct.split(";")[0].trim();
    return { base64: buffer.toString("base64"), mimeType };
  } catch {
    return null;
  }
}

export async function generateNanoBananaImage(
  prompt: string,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  const hasRefs = characterRefs && characterRefs.length > 0;
  const fb = fallbackDimensions(aspectRatio);

  try {
    // Build multimodal content parts
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    // Add character reference images as native multimodal input
    if (hasRefs) {
      const charDescriptions = characterRefs.map((c, i) =>
        `[Character ${i + 1}: ${c.description || "reference character"}]`
      ).join(", ");

      contentParts.push({
        type: "text",
        text: `Generate an image with these characters maintaining their exact appearance from the reference images: ${charDescriptions}\n\n${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
      });

      const imagePromises = characterRefs.map(async (c) => {
        const img = await fetchImageAsBase64(c.url);
        if (img) {
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          });
        }
      });
      await Promise.all(imagePromises);
    } else {
      contentParts.push({
        type: "text",
        text: `${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
      });
    }

    const body = {
      model: GEMINI_IMAGE_MODEL,
      messages: [{ role: "user", content: contentParts }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: aspectRatio },
    };

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`Gemini image generation failed (${res.status}):`, errBody);
      return null;
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;

    // Extract base64 image from response
    let imageDataUrl: string | null = null;

    // Check for images array (OpenRouter format)
    if (message?.images?.length > 0) {
      imageDataUrl = message.images[0].image_url?.url || null;
    }

    // Fallback: check content parts for inline images
    if (!imageDataUrl && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.type === "image_url" && part.image_url?.url) {
          imageDataUrl = part.image_url.url;
          break;
        }
      }
    }

    if (!imageDataUrl) {
      console.warn("Gemini image generation returned no image");
      return null;
    }

    // If it's a base64 data URL, convert to a hosted URL via fal storage
    if (imageDataUrl.startsWith("data:")) {
      const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) return null;

      const buffer = Buffer.from(base64Match[2], "base64");
      const blob = new Blob([buffer], { type: base64Match[1] });
      const file = new File([blob], `gemini_${Date.now()}.jpg`, { type: base64Match[1] });
      const hostedUrl = await fal.storage.upload(file);
      imageDataUrl = hostedUrl;
    }

    return {
      url: imageDataUrl,
      type: "image",
      source: "nano-banana",
      width: fb.width,
      height: fb.height,
    };
  } catch (err) {
    console.warn(`Gemini image generation failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function editImageViaGemini(
  editPrompt: string,
  sourceImageUrl: string,
  aspectRatio: AspectRatio = "1:1"
): Promise<MediaAsset | null> {
  const fb = fallbackDimensions(aspectRatio);

  try {
    const sourceImg = await fetchImageAsBase64(sourceImageUrl);
    if (!sourceImg) {
      console.warn("Failed to fetch source image for Gemini edit");
      return null;
    }

    const contentParts = [
      {
        type: "image_url" as const,
        image_url: { url: `data:${sourceImg.mimeType};base64,${sourceImg.base64}` },
      },
      {
        type: "text" as const,
        text: `Edit this image: ${editPrompt}. ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
      },
    ];

    const body = {
      model: GEMINI_IMAGE_MODEL,
      messages: [{ role: "user", content: contentParts }],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: aspectRatio },
    };

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.warn(`Gemini image edit failed (${res.status}):`, errBody);
      return null;
    }

    const data = await res.json();
    const message = data.choices?.[0]?.message;

    let imageDataUrl: string | null = null;
    if (message?.images?.length > 0) {
      imageDataUrl = message.images[0].image_url?.url || null;
    }
    if (!imageDataUrl && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.type === "image_url" && part.image_url?.url) {
          imageDataUrl = part.image_url.url;
          break;
        }
      }
    }

    if (!imageDataUrl) {
      console.warn("Gemini image edit returned no image");
      return null;
    }

    if (imageDataUrl.startsWith("data:")) {
      const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) return null;
      const buffer = Buffer.from(base64Match[2], "base64");
      const blob = new Blob([buffer], { type: base64Match[1] });
      const file = new File([blob], `gemini_edit_${Date.now()}.jpg`, { type: base64Match[1] });
      const hostedUrl = await fal.storage.upload(file);
      imageDataUrl = hostedUrl;
    }

    return {
      url: imageDataUrl,
      type: "image",
      source: "nano-banana",
      width: fb.width,
      height: fb.height,
    };
  } catch (err) {
    console.warn(`Gemini image edit failed: ${err instanceof Error ? err.message : err}`);
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
