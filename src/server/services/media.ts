import OpenAI from "openai";
import { MEDIA, AI_VIDEO, LLM } from "@/lib/constants";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { getKlingApiClient, type KlingTaskSubmitResponse } from "@/server/services/ai/video/providers/kling";

const openai = new OpenAI({ apiKey: MEDIA.openaiApiKey });

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

function gptImage15Size(ar: AspectRatio): "1024x1536" | "1536x1024" | "1024x1024" {
  if (ar === "16:9") return "1536x1024";
  if (ar === "1:1") return "1024x1024";
  return "1024x1536";
}

function gptImage15Dimensions(ar: AspectRatio): { width: number; height: number } {
  if (ar === "16:9") return { width: 1536, height: 1024 };
  if (ar === "1:1") return { width: 1024, height: 1024 };
  return { width: 1024, height: 1536 };
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

function klingOmniPlaceholders(promptWithElements: string, elementCount: number): string {
  let p = promptWithElements;
  for (let i = 1; i <= elementCount; i++) {
    p = p.replace(new RegExp(`@Element${i}\\b`, "g"), `<<<image_${i}>>>`);
  }
  return p;
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

export async function generateImageGptImage15(
  prompt: string,
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  try {
    const dims = gptImage15Dimensions(aspectRatio);
    const response = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt: `${prompt}. ${compositionSuffix(aspectRatio)}, cinematic lighting, photorealistic, no text or watermarks.`,
      n: 1,
      size: gptImage15Size(aspectRatio),
      quality: "medium",
      response_format: "b64_json",
    });

    const item = response.data?.[0];
    const b64 = item?.b64_json;
    const remoteUrl = item?.url;

    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const key = `generated/gpt-image-1.5_${Date.now()}.png`;
      await uploadFile(key, buffer, "image/png");
      const signedUrl = await getSignedDownloadUrl(key);
      return {
        url: signedUrl,
        type: "image",
        source: "openai",
        width: dims.width,
        height: dims.height,
      };
    }

    if (remoteUrl) {
      return {
        url: remoteUrl,
        type: "image",
        source: "openai",
        width: dims.width,
        height: dims.height,
      };
    }

    return null;
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
    const elements: { url: string }[] = [];
    if (referenceImageUrl) elements.push({ url: referenceImageUrl });
    if (characterRefs && characterRefs.length > 0) {
      for (const ref of characterRefs) {
        elements.push({ url: ref.url });
      }
    }

    const elementRefs =
      elements.length > 0
        ? ` ${elements.map((_, i) => `@Element${i + 1}`).join(" ")}`
        : "";

    const fb = fallbackDimensions(aspectRatio);
    const kling = getKlingApiClient();
    const client = kling.getHttp();

    if (elements.length > 0) {
      const rawPrompt = `${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks.${elementRefs}`;
      const omniPrompt = klingOmniPlaceholders(rawPrompt, elements.length);
      const payload = {
        model_name: AI_VIDEO.klingImageModelOmni,
        prompt: omniPrompt,
        image_list: elements.map((e) => ({ image: e.url })),
        aspect_ratio: aspectRatio,
        n: 1,
      };
      const { data: submit } = await client.post<KlingTaskSubmitResponse>(
        "/v1/images/omni-image",
        payload
      );
      if (submit?.code != null && submit.code !== 0) {
        throw new Error(submit.message || `Kling omni-image error code ${submit.code}`);
      }
      const taskId = submit?.data?.task_id;
      if (!taskId) throw new Error(submit?.message || "Kling omni-image returned no task_id");
      const img = await kling.pollUntilImageReady(`/v1/images/omni-image/${taskId}`);
      return {
        url: img.url,
        type: "image",
        source: "kling",
        width: img.width ?? fb.width,
        height: img.height ?? fb.height,
      };
    }

    const payload = {
      model_name: AI_VIDEO.klingImageModelDefault,
      prompt: `${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks.`,
      aspect_ratio: aspectRatio,
      n: 1,
    };
    const { data: submit } = await client.post<KlingTaskSubmitResponse>(
      "/v1/images/generations",
      payload
    );
    if (submit?.code != null && submit.code !== 0) {
      throw new Error(submit.message || `Kling image generations error code ${submit.code}`);
    }
    const taskId = submit?.data?.task_id;
    if (!taskId) throw new Error(submit?.message || "Kling image generations returned no task_id");
    const img = await kling.pollUntilImageReady(`/v1/images/generations/${taskId}`);
    return {
      url: img.url,
      type: "image",
      source: "kling",
      width: img.width ?? fb.width,
      height: img.height ?? fb.height,
    };
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

export async function generateViaOpenRouter(
  prompt: string,
  model: string,
  characterRefs?: CharacterRef[],
  aspectRatio: AspectRatio = "9:16"
): Promise<MediaAsset | null> {
  const hasRefs = characterRefs && characterRefs.length > 0;
  const fb = fallbackDimensions(aspectRatio);

  try {
    // Build multimodal content parts
    const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];

    if (hasRefs) {
      // Put reference images FIRST so the model sees them before the instructions
      const imageResults = await Promise.all(
        characterRefs.map(async (c) => {
          const img = await fetchImageAsBase64(c.url);
          return { ref: c, img };
        })
      );

      for (const { ref, img } of imageResults) {
        if (img) {
          const typeName = ref.type ? ref.type.charAt(0).toUpperCase() + ref.type.slice(1) : "Character";
          const label = ref.name || typeName;
          contentParts.push({
            type: "text",
            text: `Reference image for ${typeName} "${label}" — ${ref.description || "use this exact appearance"}:`,
          });
          contentParts.push({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          });
        }
      }

      contentParts.push({
        type: "text",
        text: `Now generate a NEW image following this prompt. The character(s) shown in the reference image(s) above MUST appear with the SAME face, hair, skin tone, body proportions, and clothing style — do NOT change their appearance.\n\n${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
      });
    } else {
      contentParts.push({
        type: "text",
        text: `${prompt}. ${compositionSuffix(aspectRatio)}, highly detailed, cinematic lighting, no text or watermarks.`,
      });
    }

    const body = {
      model,
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

    // If it's a base64 data URL, convert to a hosted URL via object storage
    if (imageDataUrl.startsWith("data:")) {
      const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) return null;

      const buffer = Buffer.from(base64Match[2], "base64");
      const key = `generated/gemini_${Date.now()}.jpg`;
      await uploadFile(key, buffer, base64Match[1]);
      imageDataUrl = await getSignedDownloadUrl(key);
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
      model: 'google/gemini-3.1-flash-image-preview',
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
      const key = `generated/gemini_edit_${Date.now()}.jpg`;
      await uploadFile(key, buffer, base64Match[1]);
      imageDataUrl = await getSignedDownloadUrl(key);
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
    return generateViaOpenRouter(prompt, 'google/gemini-3.1-flash-image-preview', characterRefs, aspectRatio);
  }
  if (imageModel === "nano-banana-pro") {
    return generateViaOpenRouter(prompt, 'google/gemini-3-pro-image-preview', characterRefs, aspectRatio);
  }
  if (imageModel === "kling-image-v3") {
    return generateKlingImage(prompt, undefined, characterRefs, aspectRatio);
  }
  if (imageModel === "gpt-image-1.5") {
    return generateImageGptImage15(prompt, aspectRatio);
  }
  return generateImageDallE3(prompt, aspectRatio);
}
