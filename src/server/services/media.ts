import OpenAI, { toFile } from "openai";
import { MEDIA, LLM, AI_VIDEO } from "@/lib/constants";
import { sleep } from "@/lib/utils";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { recordAiCall } from "@/server/services/ai-audit";

const openai = new OpenAI({ apiKey: MEDIA.openaiApiKey });

export interface MediaAsset {
  url: string;
  type: "video" | "image";
  source: "openai" | "kling" | "nano-banana";
  width: number;
  height: number;
}

function gptImage15Size(ar: TAspectRatio): "1024x1536" | "1536x1024" | "1024x1024" {
  if (ar === "16:9") return "1536x1024";
  if (ar === "1:1") return "1024x1024";
  return "1024x1536";
}

function gptImage15Dimensions(ar: TAspectRatio): { width: number; height: number } {
  if (ar === "16:9") return { width: 1536, height: 1024 };
  if (ar === "1:1") return { width: 1024, height: 1024 };
  return { width: 1024, height: 1536 };
}

function fallbackDimensions(ar: TAspectRatio): { width: number; height: number } {
  if (ar === "16:9") return { width: 1344, height: 768 };
  if (ar === "1:1") return { width: 1024, height: 1024 };
  return { width: 768, height: 1344 };
}

function compositionSuffix(ar: TAspectRatio): string {
  if (ar === "16:9") return "Landscape 16:9 composition";
  if (ar === "1:1") return "Square 1:1 composition";
  return "Vertical 9:16 composition";
}

type OpenAiGptImageModelId = "gpt-image-1.5" | "gpt-image-2";

/** Shared path for gpt-image-1.5 and gpt-image-2 (Images API, same size / quality tier). */
async function generateOpenAiGptImageModel(
  model: OpenAiGptImageModelId,
  prompt: string,
  aspectRatio: TAspectRatio = "9:16"
): Promise<MediaAsset | null> {
  try {
    const dims = gptImage15Dimensions(aspectRatio);
    const finalPrompt = `${prompt}. ${compositionSuffix(aspectRatio)}, cinematic lighting, photorealistic, no text or watermarks.`;
    const size = gptImage15Size(aspectRatio);
    const response = await recordAiCall(
      {
        provider: "openai",
        model,
        operation: "image.generate",
        request: { model, prompt: finalPrompt, n: 1, size, quality: "medium", moderation: "low", aspectRatio },
        summarize: (r) => {
          const item = (r as { data?: Array<{ url?: string; b64_json?: string }> }).data?.[0];
          return { hasUrl: !!item?.url, hasB64: !!item?.b64_json, dims };
        },
      },
      () => openai.images.generate({
        model,
        prompt: finalPrompt,
        n: 1,
        size,
        quality: "medium",
        moderation: "low"
      }),
    );

    const item = response.data?.[0];
    const b64 = item?.b64_json;
    const remoteUrl = item?.url;
    const storagePrefix = model.replace(/\./g, "-");

    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const key = `generated/${storagePrefix}_${Date.now()}.png`;
      await uploadFile(key, buffer, "image/png");
      return {
        url: mediaUrl(key),
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
  } catch (err) {
    throw new Error(
      `Failed to generate image with ${model}: ${err instanceof Error ? err.message : JSON.stringify(err)}`
    );
  }
}

export async function generateImageGptImage15(
  prompt: string,
  aspectRatio: TAspectRatio = "9:16"
): Promise<MediaAsset | null> {
  return generateOpenAiGptImageModel("gpt-image-1.5", prompt, aspectRatio);
}

// Generate via OpenAI Images with reference assets. Uses images.edit (the only
// OpenAI endpoint that accepts input images) and pins the API model to
// gpt-image-1.5 — same pin as editImageViaGptImage2 below — because gpt-image-2
// does not currently expose an edits endpoint.
async function generateOpenAiGptImageWithRefs(
  requestedModel: OpenAiGptImageModelId,
  prompt: string,
  aspectRatio: TAspectRatio,
  characterRefs: CharacterRef[],
): Promise<MediaAsset | null> {
  const refs = characterRefs.slice(0, 4);
  const fetched = await Promise.all(
    refs.map(async (r) => ({ ref: r, img: await fetchImageAsBase64(mediaUrl(r.url)) })),
  );
  const usable = fetched.filter(
    (f): f is { ref: CharacterRef; img: { base64: string; mimeType: string } } => !!f.img,
  );

  if (usable.length === 0) {
    return generateOpenAiGptImageModel(requestedModel, prompt, aspectRatio);
  }

  try {
    const imageParts: Awaited<ReturnType<typeof base64ImageToUploadable>>[] = [];
    for (let i = 0; i < usable.length; i++) {
      imageParts.push(await base64ImageToUploadable(usable[i].img, `ref-${i}.jpg`));
    }

    const refLines = usable
      .map(({ ref }, i) => {
        const typeName = ref.type
          ? ref.type.charAt(0).toUpperCase() + ref.type.slice(1)
          : "Character";
        const label = ref.name || typeName;
        return `Image ${i + 1}: ${typeName} "${label}" — ${ref.description || "preserve exact appearance"}.`;
      })
      .join("\n");

    const composedPrompt =
      `The attached images are reference photos. Any character(s)/subject(s) shown MUST appear in the output with the SAME face, hair, skin tone, body proportions, and clothing style — do NOT change their appearance.\n` +
      `${refLines}\n\n` +
      `Generate a NEW scene following this prompt: ${prompt}. ${compositionSuffix(aspectRatio)}, cinematic lighting, photorealistic, no text or watermarks.`;

    const dims = gptImage15Dimensions(aspectRatio);
    const editSize = gptImage15Size(aspectRatio);
    const response = await recordAiCall(
      {
        provider: "openai",
        model: "gpt-image-1.5",
        operation: "image.editWithRefs",
        request: {
          model: "gpt-image-1.5",
          requestedModel,
          prompt: composedPrompt,
          n: 1,
          size: editSize,
          quality: "medium",
          aspectRatio,
          refCount: imageParts.length,
          refs: usable.map(({ ref }) => ({ url: ref.url, name: ref.name, type: ref.type, description: ref.description })),
        },
        summarize: (r) => {
          const item = (r as { data?: Array<{ url?: string; b64_json?: string }> }).data?.[0];
          return { hasUrl: !!item?.url, hasB64: !!item?.b64_json, dims };
        },
      },
      () => openai.images.edit({
        model: "gpt-image-1.5",
        image: imageParts,
        prompt: composedPrompt,
        n: 1,
        size: editSize,
        quality: "medium",
      }),
    );

    const item = response.data?.[0];
    const b64 = item?.b64_json;
    const storagePrefix = requestedModel.replace(/\./g, "-");

    if (b64) {
      const buffer = Buffer.from(b64, "base64");
      const key = `generated/${storagePrefix}_refs_${Date.now()}.png`;
      await uploadFile(key, buffer, "image/png");
      return {
        url: mediaUrl(key),
        type: "image",
        source: "openai",
        width: dims.width,
        height: dims.height,
      };
    }

    const remoteUrl = item?.url;
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
  } catch (err) {
    throw new Error(
      `Failed to generate image with ${requestedModel} (refs): ${err instanceof Error ? err.message : JSON.stringify(err)}`,
    );
  }
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

    const data = await recordAiCall(
      {
        provider: "openrouter",
        model,
        operation: "image.generate.gemini",
        request: { ...body, refCount: characterRefs?.length ?? 0, aspectRatio, prompt },
        summarize: (r) => {
          const msg = (r as { choices?: Array<{ message?: { images?: Array<unknown> } }> })
            .choices?.[0]?.message;
          return { hasImages: !!msg?.images?.length };
        },
      },
      async () => {
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
        return res.json();
      },
    ).catch((err) => {
      console.warn(`Gemini image generation failed:`, err instanceof Error ? err.message : err);
      return null;
    });

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

const REPLICATE_API = "https://api.replicate.com/v1";

async function generateViaSeedream5Lite(
  prompt: string,
  characterRefs?: CharacterRef[],
  aspectRatio: TAspectRatio = "9:16"
): Promise<MediaAsset | null> {
  const token = AI_VIDEO.replicateToken;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");

  const ar = aspectRatio === "auto" ? "9:16" : aspectRatio;
  const dims = fallbackDimensions(ar);

  let finalPrompt = prompt;
  if (characterRefs && characterRefs.length > 0) {
    const refDescriptions = characterRefs
      .map((r) => `${r.name ?? "Character"}: ${r.description}`)
      .join(". ");
    finalPrompt = `${finalPrompt}. ${refDescriptions}`;
  }
  finalPrompt += `. ${compositionSuffix(ar)}, cinematic lighting, photorealistic, no text or watermarks.`;

  const input: Record<string, unknown> = {
    prompt: finalPrompt,
    size: "2K",
    aspect_ratio: ar,
  };

  if (characterRefs && characterRefs.length > 0) {
    input.image_input = characterRefs.slice(0, 4).map((r) => r.url);
  }

  const startRes = await fetch(`${REPLICATE_API}/models/bytedance/seedream-5-lite/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!startRes.ok) throw new Error(`SeeDream 5 Lite API error ${startRes.status}: ${await startRes.text()}`);
  const prediction = await startRes.json();
  const predictionId = prediction.id as string;

  let status: string = prediction.status;
  let output: unknown = prediction.output;
  while (status !== "succeeded" && status !== "failed" && status !== "canceled") {
    await sleep(3000);
    const pollRes = await fetch(`${REPLICATE_API}/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pollData = await pollRes.json();
    status = pollData.status;
    output = pollData.output;
  }

  if (status !== "succeeded" || !output) return null;

  const imageUrl = Array.isArray(output) ? output[0] : typeof output === "string" ? output : null;
  if (!imageUrl) return null;

  const imgRes = await fetch(imageUrl as string);
  if (!imgRes.ok) throw new Error("Failed to download SeeDream 5 Lite image");
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const key = `generated/seedream5lite_${Date.now()}.jpg`;
  await uploadFile(key, buffer, "image/jpeg");

  return { url: mediaUrl(key), type: "image", source: "openai", width: dims.width, height: dims.height };
}

export async function generateImage(
  prompt: string,
  imageModel = "gpt-image-1.5",
  characterRefs?: CharacterRef[],
  aspectRatio: TAspectRatio = "9:16"
): Promise<MediaAsset> {
  const hasRefs = !!characterRefs && characterRefs.length > 0;
  const models = {
    "nano-banana-2": () => generateViaOpenRouter(prompt, 'google/gemini-3.1-flash-image-preview', characterRefs, aspectRatio),
    "nano-banana-pro": () => generateViaOpenRouter(prompt, 'google/gemini-3-pro-image-preview', characterRefs, aspectRatio),
    "gpt-image-1.5": () =>
      hasRefs
        ? generateOpenAiGptImageWithRefs("gpt-image-1.5", prompt, aspectRatio, characterRefs!)
        : generateImageGptImage15(prompt, aspectRatio),
    "gpt-image-2": () =>
      hasRefs
        ? generateOpenAiGptImageWithRefs("gpt-image-2", prompt, aspectRatio, characterRefs!)
        : generateOpenAiGptImageModel("gpt-image-2", prompt, aspectRatio),
    "seedream-5-lite": () => generateViaSeedream5Lite(prompt, characterRefs, aspectRatio),
  }

  const result = await models[imageModel as keyof typeof models]?.();

  if (!result) {
    throw new Error(
      `${imageModel} failed to generate image. The job will fail — you can retry or switch to a different model in series settings.`
    );
  }

  return result;
}