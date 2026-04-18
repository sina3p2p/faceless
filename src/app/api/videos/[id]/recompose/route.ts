import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { renderQueue } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (video.status !== "COMPLETED") return badRequest("Video must be completed to recompose");
  if (video.scenes.length === 0) return badRequest("No scenes to recompose");
  if (!video.seriesId) return badRequest("Cannot recompose without a series.");

  await db
    .update(videoProjects)
    .set({ status: "RENDERING" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("compose-final", {
    videoProjectId: id,
    userId: user.id,
    seriesId: video.seriesId,
  });

  return NextResponse.json({ success: true, status: "RENDERING" });
}
