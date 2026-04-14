import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { generateImage, type CharacterRef, type AspectRatio } from "@/server/services/media";
import { serializeCanonicalForImageProvider } from "@/server/services/llm/prompt-contract";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { getVideoSize, IMAGE_MODELS } from "@/lib/constants";
import { z } from "zod";

const bodySchema = z.object({
  imagePrompt: z.string().min(1).optional(),
  imageModel: z.enum(IMAGE_MODELS.map(m => m.id)).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; frameId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, frameId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: {
      series: {
        columns: {
          userId: true,
          imageModel: true,
          videoSize: true,
          storyAssets: true,
          characterImages: true,
        },
      },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const frame = await db.query.sceneFrames.findFirst({
    where: eq(sceneFrames.id, frameId),
    with: { imageMedia: true },
  });

  if (!frame) return notFound("Frame not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const imageModel = parsed.data.imageModel || video.series.imageModel || "dall-e-3";
  const sizeConfig = getVideoSize(video.series.videoSize);
  const aspectRatio = sizeConfig.id as AspectRatio;

  const canonicalPrompt = parsed.data.imagePrompt || frame.imagePrompt || "scene image";
  const { providerPrompt } = serializeCanonicalForImageProvider(canonicalPrompt);

  // Resolve story assets filtered by frame's assetRefs
  const rawAssets = (video.series.storyAssets ?? []) as Array<{ id: string; type: string; name: string; description: string; url: string; sheetUrl?: string }>;
  const rawChars = (video.series.characterImages ?? []) as Array<{ url: string; description: string }>;
  const frameAssetRefs = (frame.assetRefs as string[] | null) ?? [];

  const characterRefs: CharacterRef[] = [];

  if (rawAssets.length > 0) {
    const refSet = frameAssetRefs.length > 0
      ? new Set(frameAssetRefs.map((r) => r.toLowerCase()))
      : null;
    const matched = refSet
      ? rawAssets.filter((a) => refSet.has(a.name.toLowerCase()))
      : rawAssets;
    for (const a of matched) {
      // Prefer sheetUrl (character sheet) over original url
      const assetUrl = a.sheetUrl || a.url;
      const url = assetUrl.startsWith("http") ? assetUrl : await getSignedDownloadUrl(assetUrl);
      characterRefs.push({ url, description: `${a.name}: ${a.description}`, name: a.name, type: a.type as "character" | "location" | "prop" });
    }
  } else if (rawChars.length > 0) {
    for (const c of rawChars) {
      const url = c.url.startsWith("http") ? c.url : await getSignedDownloadUrl(c.url);
      characterRefs.push({ url, description: c.description });
    }
  }

  try {
    const result = await generateImage(
      providerPrompt,
      imageModel,
      characterRefs.length > 0 ? characterRefs : undefined,
      aspectRatio
    );

    if (!result) {
      return NextResponse.json(
        { error: `${imageModel} failed to generate the image. Try again or switch models.`, failedModel: imageModel },
        { status: 422 }
      );
    }

    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) throw new Error("Failed to download generated image");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `frames/${videoId}/frame_${frameId}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const [newMedia] = await db.insert(media).values({
      frameId,
      type: "image",
      url: key,
      prompt: parsed.data.imagePrompt || frame.imagePrompt,
      modelUsed: imageModel,
    }).returning();

    const updates: Record<string, unknown> = {
      imageMediaId: newMedia.id,
      modelUsed: imageModel,
      imageGeneratedAt: new Date(),
    };
    if (parsed.data.imagePrompt) {
      updates.imagePrompt = parsed.data.imagePrompt;
    }

    await db
      .update(sceneFrames)
      .set(updates)
      .where(eq(sceneFrames.id, frameId));

    const signedUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({ imageUrl: key, signedUrl, imageModel });
  } catch (err) {
    console.error(`Frame image generation failed for ${frameId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
