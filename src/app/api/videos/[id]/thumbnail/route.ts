import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { generateImage, generateKlingImage, generateNanoBananaImage } from "@/server/services/media";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod/v4";

const bodySchema = z.object({
  prompt: z.string().optional(),
  imageModel: z.enum(["dall-e-3", "kling-image-v3", "nano-banana-2"]).default("dall-e-3"),
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
          userId: true, characterImages: true, niche: true, style: true,
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

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { imageModel } = parsed.data;

  let prompt = parsed.data.prompt;
  if (!prompt?.trim()) {
    const title = video.title || "Untitled Video";
    const style = video.series.style || "cinematic";
    const niche = video.series.niche || "general";
    const videoType = video.series.videoType || "faceless";

    const hook = video.scenes?.[0]?.text?.slice(0, 120) || "";
    const keyVisual = video.scenes?.[0]?.visualDescription?.slice(0, 150)
      || video.scenes?.[0]?.imagePrompt?.slice(0, 150)
      || "";

    const charDescs = ((video.series.characterImages ?? []) as Array<{ url: string; description: string }>)
      .filter((c) => c.description)
      .map((c) => c.description)
      .join("; ");

    prompt = [
      `A viral YouTube/TikTok thumbnail for a ${niche} video titled "${title}"`,
      `in ${style} art style.`,
      videoType === "music_video" ? "This is a music video — convey rhythm, energy, and musicality." : "",
      keyVisual ? `Key visual: ${keyVisual}.` : "",
      charDescs ? `Featuring characters: ${charDescs}.` : "",
      hook ? `Opening hook: "${hook}"` : "",
      `Ultra dramatic composition with bold vivid colors, extreme contrast, and cinematic depth of field.`,
      `The thumbnail must trigger curiosity and make viewers NEED to click.`,
      `Landscape 16:9 format, hyper-detailed, professional quality, no text, no watermarks, no borders.`,
    ].filter(Boolean).join(" ");
  }

  const rawChars = (video.series.characterImages ?? []) as Array<{ url: string; description: string }>;
  let charRefs: Array<{ url: string; description: string }> | undefined;
  if (rawChars.length > 0 && imageModel === "nano-banana-2") {
    charRefs = await Promise.all(
      rawChars.map(async (c) => ({
        url: c.url.startsWith("http") ? c.url : await getSignedDownloadUrl(c.url),
        description: c.description,
      }))
    );
  }

  try {
    let imageUrl: string | null = null;

    if (imageModel === "nano-banana-2") {
      const result = await generateNanoBananaImage(prompt, charRefs);
      imageUrl = result?.url ?? null;
    } else if (imageModel === "kling-image-v3") {
      const result = await generateKlingImage(prompt);
      imageUrl = result?.url ?? null;
    } else {
      const result = await generateImage(prompt);
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
