import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { editImageViaGptImage2 } from "@/server/services/media";
import { mediaUrl, uploadFile } from "@/lib/storage";
import { LLM } from "@/lib/constants";
import { z } from "zod";

const bodySchema = z.object({
  sourceImageUrl: z.string().min(1),
  annotatedImageUrl: z.string().optional(),
  referenceImageUrls: z.array(z.string()).optional(),
  editPrompt: z.string().min(1),
  model: z
    .enum(["nano-banana-2", "nano-banana-pro", "gpt-image-2"])
    .default("nano-banana-2"),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).default("9:16"),
});

const MODEL_MAP: Record<string, string> = {
  "nano-banana-2": "google/gemini-3.1-flash-image-preview",
  "nano-banana-pro": "google/gemini-3-pro-image-preview",
};

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

function compositionSuffix(ar: TAspectRatio): string {
  if (ar === "16:9") return "Landscape 16:9 composition";
  if (ar === "1:1") return "Square 1:1 composition";
  return "Vertical 9:16 composition";
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

  const {
    sourceImageUrl,
    annotatedImageUrl,
    referenceImageUrls,
    editPrompt,
    model,
    aspectRatio,
  } = parsed.data;

  try {
    const sourceImg = await fetchImageAsBase64(await mediaUrl(sourceImageUrl));

    if (!sourceImg) {
      return NextResponse.json(
        { error: "Failed to load source image for editing." },
        { status: 422 },
      );
    }

    const hasAnnotations = !!annotatedImageUrl;
    let annotatedImg: { base64: string; mimeType: string } | null = null;
    if (hasAnnotations) {
      annotatedImg = await fetchImageAsBase64(await mediaUrl(annotatedImageUrl));
    }

    // Fetch reference images (from @mentions)
    const refImages: Array<{ base64: string; mimeType: string }> = [];
    if (referenceImageUrls?.length) {
      const results = await Promise.all(
        referenceImageUrls.slice(0, 4).map(async (url) =>
          fetchImageAsBase64(await mediaUrl(url))
        ),
      );
      for (const r of results) {
        if (r) refImages.push(r);
      }
    }

    if (model === "gpt-image-2") {
      const editedUrl = await editImageViaGptImage2(
        editPrompt,
        aspectRatio,
        sourceImg,
        {
          annotatedImg: annotatedImg,
          referenceImages: refImages.length > 0 ? refImages : undefined,
        },
      );
      if (!editedUrl) {
        return NextResponse.json(
          {
            error:
              "Image editing failed. Try again or use a different model.",
          },
          { status: 422 },
        );
      }
      return NextResponse.json({ url: editedUrl });
    }

    const contentParts: Array<
      | { type: "image_url"; image_url: { url: string } }
      | { type: "text"; text: string }
    > = [];

    // Add reference images first so the model has visual context
    if (refImages.length > 0) {
      contentParts.push({
        type: "text",
        text: `Here ${refImages.length === 1 ? "is a reference image" : `are ${refImages.length} reference images`} from other frames for visual context:`,
      });
      for (const ref of refImages) {
        contentParts.push({
          type: "image_url",
          image_url: {
            url: `data:${ref.mimeType};base64,${ref.base64}`,
          },
        });
      }
    }

    if (annotatedImg) {
      contentParts.push(
        {
          type: "text",
          text: "The following image has colored highlights/markers showing exactly which areas to edit:",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${annotatedImg.mimeType};base64,${annotatedImg.base64}`,
          },
        },
        {
          type: "text",
          text: "Now here is the clean original image to edit:",
        },
        {
          type: "image_url",
          image_url: {
            url: `data:${sourceImg.mimeType};base64,${sourceImg.base64}`,
          },
        },
        {
          type: "text",
          text: `Edit ONLY the highlighted areas from the reference image above. Apply this change to the clean image: ${editPrompt}. Keep everything outside the highlighted areas exactly the same. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks. Do NOT include any highlights, markers, or selection rectangles in the output.`,
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
          text: `Edit this image: ${editPrompt}. ${compositionSuffix(aspectRatio)}, highly detailed, no text or watermarks.`,
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
      imageDataUrl = await mediaUrl(key);
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
