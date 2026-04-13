import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { type AspectRatio } from "@/server/services/media";
import { getSignedDownloadUrl, uploadFile } from "@/lib/storage";
import { LLM } from "@/lib/constants";
import { z } from "zod";

const bodySchema = z.object({
  sourceImageUrl: z.string().min(1),
  annotatedImageUrl: z.string().optional(),
  editPrompt: z.string().min(1),
  model: z.enum(["nano-banana-2", "nano-banana-pro"]).default("nano-banana-2"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
});

const MODEL_MAP: Record<string, string> = {
  "nano-banana-2": "google/gemini-3.1-flash-image-preview",
  "nano-banana-pro": "google/gemini-3-pro-image-preview",
};

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function compositionSuffix(ar: AspectRatio): string {
  if (ar === "16:9") return "Landscape 16:9 composition";
  if (ar === "1:1") return "Square 1:1 composition";
  return "Vertical 9:16 composition";
}

async function resolveUrl(urlOrKey: string): Promise<string> {
  if (urlOrKey.startsWith("http")) return urlOrKey;
  return getSignedDownloadUrl(urlOrKey);
}

async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
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

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { sourceImageUrl, annotatedImageUrl, editPrompt, model, aspectRatio } =
    parsed.data;

  try {
    const resolvedUrl = await resolveUrl(sourceImageUrl);
    const sourceImg = await fetchImageAsBase64(resolvedUrl);

    if (!sourceImg) {
      return NextResponse.json(
        { error: "Failed to load source image for editing." },
        { status: 422 },
      );
    }

    const hasAnnotations = !!annotatedImageUrl;
    let annotatedImg: { base64: string; mimeType: string } | null = null;
    if (hasAnnotations) {
      const resolvedAnnotated = await resolveUrl(annotatedImageUrl);
      annotatedImg = await fetchImageAsBase64(resolvedAnnotated);
    }

    const contentParts: Array<
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string }
    > = [];

    if (annotatedImg) {
      // Two-image approach: annotated image shows WHERE to edit, clean image is WHAT to edit
      contentParts.push(
        {
          type: "image_url",
          image_url: {
            url: `data:${annotatedImg.mimeType};base64,${annotatedImg.base64}`,
          },
        },
        {
          type: "text",
          text: "The image above has colored highlights/markers showing exactly which areas to edit. Now here is the clean original image:",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${sourceImg.mimeType};base64,${sourceImg.base64}`,
          },
        },
        {
          type: "text",
          text: `Edit ONLY the highlighted areas from the reference image above. Apply this change to the clean image: ${editPrompt}. Keep everything outside the highlighted areas exactly the same. ${compositionSuffix(aspectRatio as AspectRatio)}, highly detailed, no text or watermarks. Do NOT include any highlights, markers, or selection rectangles in the output.`,
        },
      );
    } else {
      contentParts.push(
        {
          type: "image_url",
          image_url: {
            url: `data:${sourceImg.mimeType};base64,${sourceImg.base64}`,
          },
        },
        {
          type: "text",
          text: `Edit this image: ${editPrompt}. ${compositionSuffix(aspectRatio as AspectRatio)}, highly detailed, no text or watermarks.`,
        },
      );
    }

    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LLM.apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_MAP[model],
        messages: [{ role: "user", content: contentParts }],
        modalities: ["image", "text"],
        image_config: { aspect_ratio: aspectRatio },
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Image edit failed (${res.status}):`, errBody);
      return NextResponse.json(
        { error: `Image editing failed (${res.status}). Try again.` },
        { status: 422 },
      );
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
      console.error("Image edit returned no image. Response:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json(
        { error: "Model returned no image. Try again or use a different model." },
        { status: 422 },
      );
    }

    // Upload base64 result to S3
    if (imageDataUrl.startsWith("data:")) {
      const base64Match = imageDataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!base64Match) {
        return NextResponse.json(
          { error: "Invalid image data returned." },
          { status: 422 },
        );
      }
      const buffer = Buffer.from(base64Match[2], "base64");
      const key = `generated/edit_${Date.now()}.jpg`;
      await uploadFile(key, buffer, base64Match[1]);
      imageDataUrl = await getSignedDownloadUrl(key);
    }

    return NextResponse.json({ url: imageDataUrl });
  } catch (err) {
    console.error("Image edit failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image editing failed" },
      { status: 500 },
    );
  }
}
