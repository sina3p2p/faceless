import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  variantId: z.string().min(1),
  type: z.enum(["image", "video"]),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; frameId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, frameId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const frame = await db.query.sceneFrames.findFirst({
    where: eq(sceneFrames.id, frameId),
  });

  if (!frame) return notFound("Frame not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { variantId, type } = parsed.data;

  if (type === "image") {
    const variants = (frame.imageVariants as Array<{ id: string; url: string; prompt: string | null; modelUsed: string | null; createdAt: string }>) ?? [];
    const selected = variants.find((v) => v.id === variantId);
    if (!selected) return notFound("Variant not found");

    // Swap: push current to variants, remove selected from variants, set selected as active
    const updatedVariants = variants.filter((v) => v.id !== variantId);
    if (frame.imageUrl) {
      updatedVariants.push({
        id: crypto.randomUUID(),
        url: frame.imageUrl,
        prompt: frame.imagePrompt,
        modelUsed: frame.modelUsed,
        createdAt: frame.createdAt.toISOString(),
      });
    }

    await db
      .update(sceneFrames)
      .set({
        imageUrl: selected.url,
        imagePrompt: selected.prompt ?? frame.imagePrompt,
        modelUsed: selected.modelUsed,
        imageVariants: updatedVariants,
      })
      .where(eq(sceneFrames.id, frameId));
  } else {
    const variants = (frame.videoVariants as Array<{ id: string; url: string; modelUsed: string | null; createdAt: string }>) ?? [];
    const selected = variants.find((v) => v.id === variantId);
    if (!selected) return notFound("Variant not found");

    const updatedVariants = variants.filter((v) => v.id !== variantId);
    if (frame.videoUrl) {
      updatedVariants.push({
        id: crypto.randomUUID(),
        url: frame.videoUrl,
        modelUsed: frame.modelUsed,
        createdAt: frame.createdAt.toISOString(),
      });
    }

    await db
      .update(sceneFrames)
      .set({
        videoUrl: selected.url,
        videoVariants: updatedVariants,
      })
      .where(eq(sceneFrames.id, frameId));
  }

  return NextResponse.json({ success: true });
}
