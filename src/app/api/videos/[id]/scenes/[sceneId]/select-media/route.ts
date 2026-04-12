import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const bodySchema = z.object({
  mediaId: z.string().min(1),
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
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const mediaItem = await db.query.media.findFirst({
    where: and(
      eq(media.id, parsed.data.mediaId),
      eq(media.sceneId, sceneId)
    ),
  });

  if (!mediaItem) return notFound("Media version not found");

  const updates: Record<string, unknown> = {};
  if (mediaItem.type === "image") {
    updates.imageUrl = mediaItem.url;
    updates.assetUrl = mediaItem.url;
    updates.assetType = "image";
  } else {
    updates.videoUrl = mediaItem.url;
    updates.assetUrl = mediaItem.url;
    updates.assetType = "video";
  }

  await db
    .update(videoScenes)
    .set(updates)
    .where(and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)));

  return NextResponse.json({ success: true, type: mediaItem.type, url: mediaItem.url });
}
