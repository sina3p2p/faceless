import OpenAI, { toFile } from "openai";
import { MEDIA, LLM } from "@/lib/constants";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { recordAiCall } from "@/server/services/ai-audit";
import { IImageRequest } from "@/types/video-provider";
import { OpenAIVideoProvider } from "./ai/video/providers/openai";

const openai = new OpenAI({ apiKey: MEDIA.openaiApiKey });

function gptImage15Size(ar: TAspectRatio): "1024x1536" | "1536x1024" | "1024x1024" {
  if (ar === "16:9") return "1536x1024";
  if (ar === "1:1") return "1024x1024";
  return "1024x1536";
}

function compositionSuffix(ar: TAspectRatio): string {
  if (ar === "16:9") return "Landscape 16:9 composition";
  if (ar === "1:1") return "Square 1:1 composition";
  return "Vertical 9:16 composition";
}

async function base64ImageToUploadable(
  img: { base64: string; mimeType: string },
  filename: string,
) {
  const buf = Buffer.from(img.base64, "base64");
  return toFile(buf, filename, { type: img.mimeType });
}

/**
 * Image API edits for `gpt-image-2` (supports multiple input images for refs + annotated workflow).
 * Returns a signed storage URL for the edited image.
 */
export async function editImageViaGptImage2(
  editPrompt: string,
  aspectRatio: TAspectRatio,
  sourceImg: { base64: string; mimeType: string },
  options?: {
    annotatedImg?: { base64: string; mimeType: string } | null;
    referenceImages?: Array<{ base64: string; mimeType: string }>;
  },
): Promise<string | null> {
  try {
    const refs = (options?.referenceImages ?? []).slice(0, 4);
    const annotated = options?.annotatedImg ?? null;

    const imageParts: Awaited<ReturnType<typeof base64ImageToUploadable>>[] = [];
    let prompt = "";

    if (refs.length > 0) {
      prompt += `Here ${refs.length === 1 ? "is a reference image" : `are ${refs.length} reference images`} from other frames for visual context.\n\n`;
      for (let i = 0; i < refs.length; i++) {
        imageParts.push(
          await base64ImageToUploadable(refs[i], `ref-${i}.jpg`),
        );
      }
    }

    if (annotated) {
      prompt +=
        "The next image has colored highlights/markers showing exactly which areas to edit.\n\n";
      prompt +=
        "The image after that is the clean original to edit.\n\n";
      prompt += `Edit ONLY the highlighted areas from the reference image above. Apply this change to the clean image: ${editPrompt}. Keep everything outside the highlighted areas exactly the same. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks. Do NOT include any highlights, markers, or selection rectangles in the output.`;
      imageParts.push(
        await base64ImageToUploadable(annotated, "annotated.jpg"),
      );
      imageParts.push(
        await base64ImageToUploadable(sourceImg, "source.jpg"),
      );
    } else {
      prompt +=
        refs.length > 0
          ? `Edit the main frame (last image in this request): ${editPrompt}. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks. Use earlier images only as visual reference when helpful.`
          : `Edit this image: ${editPrompt}. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks.`;
      imageParts.push(
        await base64ImageToUploadable(sourceImg, "source.jpg"),
      );
    }

    const editPromptSize = gptImage15Size(aspectRatio);
    const response = await recordAiCall(
      {
        provider: "openai",
        model: "gpt-image-1.5",
        operation: "image.edit.gptImage2",
        request: {
          model: "gpt-image-1.5",
          prompt,
          n: 1,
          size: editPromptSize,
          quality: "medium",
          aspectRatio,
          hasAnnotated: !!annotated,
          refCount: refs.length,
          editPromptUser: editPrompt,
        },
        summarize: (r) => {
          const item = (r as { data?: Array<{ url?: string; b64_json?: string }> }).data?.[0];
          return { hasUrl: !!item?.url, hasB64: !!item?.b64_json };
        },
      },
      () => openai.images.edit({
        model: "gpt-image-1.5",
        image: imageParts,
        prompt,
        n: 1,
        size: editPromptSize,
        quality: "medium",
      }),
    );

    const item = response.data?.[0];
    const b64 = item?.b64_json;
    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const key = `generated/gpt-image-2-edit_${Date.now()}.png`;
      await uploadFile(key, buffer, "image/png");
      return mediaUrl(key);
    }

    const remoteUrl = item?.url;
    if (remoteUrl) {
      return remoteUrl;
    }

    return null;
  } catch (err) {
    console.warn(
      `gpt-image-2 edit failed: ${err instanceof Error ? err.message : JSON.stringify(err)}`,
    );
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
  aspectRatio: TAspectRatio = "9:16"
): Promise<string | null> {
  const hasRefs = characterRefs && characterRefs.length > 0;

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
      throw new Error(`Gemini image generation failed (${res.status}): ${errBody}`);
    }
    const data = await res.json();

    if (!data) return null;
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
      imageDataUrl = mediaUrl(key);
    }

    return imageDataUrl;
  } catch (err) {
    console.warn(`Gemini image generation failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export async function generateImage(req: IImageRequest): Promise<string[]> {
  const openaiProvider = new OpenAIVideoProvider();
  return openaiProvider.generateImage(req);
}