import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { generateImage, generateFluxImage, generateNanoBananaImage } from "@/server/services/media";
import { uploadFile } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  imagePrompt: z.string().min(1).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, sceneId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: {
      series: { columns: { userId: true, imageModel: true, style: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const scene = await db.query.videoScenes.findFirst({
    where: and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)),
  });

  if (!scene) return notFound("Scene not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  const promptOverride = parsed.success ? parsed.data.imagePrompt : undefined;

  const prompt = promptOverride || scene.imagePrompt || scene.text;
  const imageModel = video.series.imageModel || "dall-e-3";

  let imageUrl: string | null = null;

  try {
    if (imageModel === "nano-banana-2") {
      const result = await generateNanoBananaImage(prompt);
      imageUrl = result?.url ?? null;
    } else if (imageModel === "flux-pro") {
      const result = await generateFluxImage(prompt);
      imageUrl = result?.url ?? null;
    }

    if (!imageUrl) {
      const result = await generateImage(prompt);
      imageUrl = result?.url ?? null;
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to download generated image");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `scenes/${videoId}/preview_${sceneId}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const updates: Record<string, unknown> = {
      assetUrl: key,
      assetType: "image",
    };
    if (promptOverride) {
      updates.imagePrompt = promptOverride;
    }

    await db
      .update(videoScenes)
      .set(updates)
      .where(and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)));

    return NextResponse.json({ assetUrl: key, imageModel });
  } catch (err) {
    console.error(`Image generation failed for scene ${sceneId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
