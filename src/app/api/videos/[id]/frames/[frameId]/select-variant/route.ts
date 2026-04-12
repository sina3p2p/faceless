import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
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

  const selected = await db.query.media.findFirst({
    where: and(eq(media.id, variantId), eq(media.frameId, frameId)),
  });

  if (!selected) return notFound("Variant not found");

  if (type === "image") {
    await db
      .update(sceneFrames)
      .set({
        imageUrl: selected.url,
        imagePrompt: selected.prompt ?? frame.imagePrompt,
        modelUsed: selected.modelUsed,
      })
      .where(eq(sceneFrames.id, frameId));
  } else {
    await db
      .update(sceneFrames)
      .set({ videoUrl: selected.url })
      .where(eq(sceneFrames.id, frameId));
  }

  return NextResponse.json({ success: true });
}
