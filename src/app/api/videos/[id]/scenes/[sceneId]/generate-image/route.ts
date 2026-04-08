import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and, inArray } from "drizzle-orm";
import { generateImage, generateKlingImage, generateNanoBananaImage, type CharacterRef } from "@/server/services/media";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  imagePrompt: z.string().min(1).optional(),
  mode: z.enum(["regenerate", "edit"]).default("regenerate"),
  referenceSceneIds: z.array(z.string()).optional(),
  imageModel: z.enum(["dall-e-3", "kling-image-v3", "nano-banana-2"]).optional(),
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
      series: { columns: { userId: true, imageModel: true, style: true, characterImages: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const scene = await db.query.videoScenes.findFirst({
    where: and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)),
  });

  if (!scene) return notFound("Scene not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { mode, referenceSceneIds } = parsed.data;
  const promptOverride = parsed.data.imagePrompt;

  const cleanedPrompt = (promptOverride || scene.imagePrompt || scene.text)
    .replace(/@scene\d+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const imageModel = parsed.data.imageModel || video.series.imageModel || "dall-e-3";

  // Resolve series-level character images
  const rawChars = (video.series.characterImages ?? []) as Array<{ url: string; description: string }>;
  const charRefs: CharacterRef[] = [];
  if (rawChars.length > 0) {
    for (const c of rawChars) {
      charRefs.push({
        url: c.url.startsWith("http") ? c.url : await getSignedDownloadUrl(c.url),
        description: c.description,
      });
    }
  }

  // Resolve @sceneN reference images (supported by nano-banana-2 and kling-image-v3)
  const sceneRefs: CharacterRef[] = [];
  if (referenceSceneIds && referenceSceneIds.length > 0 && (imageModel === "nano-banana-2" || imageModel === "kling-image-v3")) {
    const refScenes = await db.query.videoScenes.findMany({
      where: and(
        eq(videoScenes.videoProjectId, videoId),
        inArray(videoScenes.id, referenceSceneIds)
      ),
      columns: { id: true, assetUrl: true, text: true },
    });

    for (const rs of refScenes) {
      if (!rs.assetUrl) continue;
      const url = rs.assetUrl.startsWith("http")
        ? rs.assetUrl
        : await getSignedDownloadUrl(rs.assetUrl);
      sceneRefs.push({ url, description: rs.text?.slice(0, 100) || "reference scene" });
    }
  }

  try {
    let imageUrl: string | null = null;

    if (mode === "edit" && imageModel === "kling-image-v3" && scene.assetUrl) {
      const currentImageUrl = scene.assetUrl.startsWith("http")
        ? scene.assetUrl
        : await getSignedDownloadUrl(scene.assetUrl);

      const editPrompt = `${cleanedPrompt}. Keep the original scene's composition and layout. Only modify what was explicitly requested.`;
      const result = await generateKlingImage(editPrompt, currentImageUrl, charRefs.length > 0 ? charRefs : undefined);
      imageUrl = result?.url ?? null;
    } else if (mode === "edit" && imageModel === "nano-banana-2" && scene.assetUrl) {
      const currentImageUrl = scene.assetUrl.startsWith("http")
        ? scene.assetUrl
        : await getSignedDownloadUrl(scene.assetUrl);

      const refDescriptions = sceneRefs.length > 0
        ? ` Use the other reference image(s) ONLY for character appearance, clothing, and facial features — do NOT copy their background, composition, or layout.`
        : "";

      const editPrompt = `Edit the first reference image: ${cleanedPrompt}.${refDescriptions} Keep the original scene's background, composition, camera angle, and overall layout. Only modify what was explicitly requested.`;

      const allRefs: CharacterRef[] = [
        { url: currentImageUrl, description: "main image to edit — preserve this scene" },
        ...sceneRefs.map((r) => ({ ...r, description: `character reference only: ${r.description}` })),
        ...charRefs,
      ];

      const result = await generateNanoBananaImage(editPrompt, allRefs);
      imageUrl = result?.url ?? null;
    } else if (imageModel === "nano-banana-2") {
      const allRefs = [...sceneRefs, ...charRefs];
      const result = await generateNanoBananaImage(cleanedPrompt, allRefs.length > 0 ? allRefs : undefined);
      imageUrl = result?.url ?? null;
    } else if (imageModel === "kling-image-v3") {
      const refUrl = sceneRefs[0]?.url;
      const result = await generateKlingImage(cleanedPrompt, refUrl, charRefs.length > 0 ? charRefs : undefined);
      imageUrl = result?.url ?? null;
    } else {
      const result = await generateImage(cleanedPrompt);
      imageUrl = result?.url ?? null;
    }

    if (!imageUrl) {
      return NextResponse.json(
        { error: `${imageModel} failed to generate the image. You can try again or switch to a different model.`, failedModel: imageModel },
        { status: 422 }
      );
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error("Failed to download generated image");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `scenes/${videoId}/preview_${sceneId}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const updates: Record<string, unknown> = {
      assetUrl: key,
      assetType: "image",
      modelUsed: imageModel,
    };
    if (mode === "regenerate" && promptOverride) {
      updates.imagePrompt = promptOverride.replace(/@scene\d+/gi, "").trim();
    }

    await db
      .update(videoScenes)
      .set(updates)
      .where(and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)));

    return NextResponse.json({ assetUrl: key, imageModel, mode });
  } catch (err) {
    console.error(`Image generation failed for scene ${sceneId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
