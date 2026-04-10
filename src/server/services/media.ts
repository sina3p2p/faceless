import OpenAI from "openai";
import { fal } from "@fal-ai/client";
import { MEDIA, AI_VIDEO, LLM } from "@/lib/constants";

const openai = new OpenAI({ apiKey: MEDIA.openaiApiKey });

fal.config({ credentials: MEDIA.falKey });

export interface MediaAsset {
  url: string;
  type: "video" | "image";
  source: "openai" | "kling" | "nano-banana";
  width: number;
  height: number;
}

export type AspectRatio = "9:16" | "16:9" | "1:1";

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
export async function generateImageDallE3(
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
  name?: string;
  type?: "character" | "location" | "prop";
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

    if (hasRefs) {
      const refLabels = characterRefs.map((c, i) => {
        const typeName = c.type ? c.type.charAt(0).toUpperCase() + c.type.slice(1) : "Character";
        const label = c.name || `${typeName} ${i + 1}`;
        return `[${typeName} "${label}": ${c.description || "reference"}]`;
      }).join(", ");

      contentParts.push({
        type: "text",
        text: `Generate an image using these reference assets — maintain their exact appearance: ${refLabels}\n\n${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
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

export async function generateImage(
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
  return generateImageDallE3(prompt, aspectRatio);
}
