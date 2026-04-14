import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { generateImage, generateKlingImage, generateViaOpenRouter } from "@/server/services/media";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod/v4";
import { IMAGE_MODELS } from "@/lib/constants";

const bodySchema = z.object({
  prompt: z.string().optional(),
  imageModel: z.enum(IMAGE_MODELS.map((m) => m.id) as [string, ...string[]]).default("dall-e-3"),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      series: {
        columns: {
          userId: true, storyAssets: true, characterImages: true, niche: true, style: true,
          videoType: true,
        },
      },
      scenes: {
        columns: { text: true, imagePrompt: true, visualDescription: true },
        orderBy: (s, { asc }) => [asc(s.sceneOrder)],
        limit: 3,
      },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { imageModel } = parsed.data;

  let prompt = parsed.data.prompt;
  if (!prompt?.trim()) {
    const title = video.title || "Untitled Video";
    const style = video.series?.style || "cinematic";
    const niche = video.series?.niche || "general";
    const videoType = video.videoType;

    const hook = video.scenes?.[0]?.text?.slice(0, 120) || "";
    const keyVisual = video.scenes?.[0]?.visualDescription?.slice(0, 150)
      || video.scenes?.[0]?.imagePrompt?.slice(0, 150)
      || "";

    const rawAssets = (video.series?.storyAssets ?? []) as Array<{ name: string; description: string }>;
    const rawChars = (video.series?.characterImages ?? []) as Array<{ description: string }>;
    const assetDescs = rawAssets.length > 0
      ? rawAssets.filter((a) => a.description).map((a) => `${a.name}: ${a.description}`).join("; ")
      : rawChars.filter((c) => c.description).map((c) => c.description).join("; ");

    prompt = [
      `A viral YouTube/TikTok thumbnail for a ${niche} video titled "${title}"`,
      `in ${style} art style.`,
      videoType === "music_video" ? "This is a music video — convey rhythm, energy, and musicality." : "",
      keyVisual ? `Key visual: ${keyVisual}.` : "",
      assetDescs ? `Featuring: ${assetDescs}.` : "",
      hook ? `Opening hook: "${hook}"` : "",
      `Ultra dramatic composition with bold vivid colors, extreme contrast, and cinematic depth of field.`,
      `The thumbnail must trigger curiosity and make viewers NEED to click.`,
      `Landscape 16:9 format, hyper-detailed, professional quality, no text, no watermarks, no borders.`,
    ].filter(Boolean).join(" ");
  }

  // Resolve asset refs for image models that support them
  const storyAssets = (video.series?.storyAssets ?? []) as Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string }>;
  const legacyChars = (video.series?.characterImages ?? []) as Array<{ url: string; description: string }>;
  let charRefs: Array<{ url: string; description: string; name?: string; type?: "character" | "location" | "prop" }> | undefined;

  if (imageModel === "nano-banana-2") {
    if (storyAssets.length > 0) {
      charRefs = await Promise.all(
        storyAssets.map(async (a) => ({
          url: a.url.startsWith("http") ? a.url : await getSignedDownloadUrl(a.url),
          description: `${a.name}: ${a.description}`,
          name: a.name,
          type: a.type,
        }))
      );
    } else if (legacyChars.length > 0) {
      charRefs = await Promise.all(
        legacyChars.map(async (c) => ({
          url: c.url.startsWith("http") ? c.url : await getSignedDownloadUrl(c.url),
          description: c.description,
        }))
      );
    }
  }

  try {
    let imageUrl: string | null = null;

    if (imageModel === "nano-banana-2") {
      const result = await generateViaOpenRouter(prompt, 'google/gemini-3.1-flash-image-preview', charRefs);
      imageUrl = result?.url ?? null;
    } else if (imageModel === "kling-image-v3") {
      const result = await generateKlingImage(prompt);
      imageUrl = result?.url ?? null;
    } else {
      const result = await generateImage(prompt, imageModel, undefined, "16:9");
      imageUrl = result?.url ?? null;
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: `${imageModel} failed to generate the thumbnail. You can try again or switch to a different model.`, failedModel: imageModel },
        { status: 422 }
      );
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to download generated thumbnail");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `thumbnails/${id}/thumb_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    await db
      .update(videoProjects)
      .set({ thumbnailUrl: key, updatedAt: new Date() })
      .where(eq(videoProjects.id, id));

    const publicUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({ thumbnailUrl: key, url: publicUrl });
  } catch (err) {
    console.error(`Thumbnail generation failed for video ${id}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Thumbnail generation failed" },
      { status: 500 }
    );
  }
}
