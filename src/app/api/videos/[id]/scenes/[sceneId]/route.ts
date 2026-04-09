import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  text: z.string().optional(),
  imagePrompt: z.string().optional(),
  visualDescription: z.string().optional(),
  searchQuery: z.string().optional(),
  speaker: z.string().optional(),
  duration: z.number().min(1).max(30).optional(),
  assetUrl: z.string().optional(),
  assetType: z.string().optional(),
  imageUrl: z.string().optional(),
});

async function verifyOwnership(videoId: string, userId: string) {
  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: { series: { columns: { userId: true } } },
  });
  if (!video || video.series.userId !== userId) return null;
  return video;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, sceneId } = await params;
  const video = await verifyOwnership(id, user.id);
  if (!video) return notFound("Video not found");

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid update data");

  const updates: Record<string, unknown> = {};
  if (parsed.data.text !== undefined) updates.text = parsed.data.text;
  if (parsed.data.imagePrompt !== undefined) updates.imagePrompt = parsed.data.imagePrompt;
  if (parsed.data.visualDescription !== undefined) updates.visualDescription = parsed.data.visualDescription;
  if (parsed.data.searchQuery !== undefined) updates.searchQuery = parsed.data.searchQuery;
  if (parsed.data.speaker !== undefined) updates.speaker = parsed.data.speaker;
  if (parsed.data.duration !== undefined) updates.duration = parsed.data.duration;
  if (parsed.data.assetUrl !== undefined) updates.assetUrl = parsed.data.assetUrl;
  if (parsed.data.assetType !== undefined) updates.assetType = parsed.data.assetType;
  if (parsed.data.imageUrl !== undefined) updates.imageUrl = parsed.data.imageUrl;

  if (Object.keys(updates).length === 0) return badRequest("No updates provided");

  await db
    .update(videoScenes)
    .set(updates)
    .where(
      and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, id))
    );

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, sceneId } = await params;
  const video = await verifyOwnership(id, user.id);
  if (!video) return notFound("Video not found");

  await db
    .delete(videoScenes)
    .where(
      and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, id))
    );

  return NextResponse.json({ success: true });
}
