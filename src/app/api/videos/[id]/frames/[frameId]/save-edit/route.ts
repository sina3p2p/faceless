import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  imageUrl: z.string().min(1),
  editPrompt: z.string().optional(),
  model: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; frameId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, frameId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series.userId !== user.id)
    return notFound("Video not found");

  const frame = await db.query.sceneFrames.findFirst({
    where: eq(sceneFrames.id, frameId),
  });

  if (!frame) return notFound("Frame not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  try {
    const sourceUrl = parsed.data.imageUrl.startsWith("http")
      ? parsed.data.imageUrl
      : await getSignedDownloadUrl(parsed.data.imageUrl);

    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) throw new Error("Failed to download edited image");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `frames/${videoId}/edit_${frameId}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const [newMedia] = await db
      .insert(media)
      .values({
        frameId,
        type: "image",
        url: key,
        prompt: parsed.data.editPrompt || "Edited image",
        modelUsed: parsed.data.model || "edit",
      })
      .returning();

    await db
      .update(sceneFrames)
      .set({
        imageMediaId: newMedia.id,
        modelUsed: parsed.data.model || "edit",
        imageGeneratedAt: new Date(),
      })
      .where(eq(sceneFrames.id, frameId));

    return NextResponse.json({ success: true, mediaId: newMedia.id });
  } catch (err) {
    console.error(`Save edit failed for frame ${frameId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 },
    );
  }
}
