import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc, count } from "drizzle-orm";
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
      series: { columns: { userId: true, id: true } },
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
    },
  });

  if (!video) return notFound("Video not found");

  if (video.scenes.length === 0) {
    return badRequest("No scenes to render");
  }

  if (!video.seriesId) {
    return badRequest("Video must belong to a series to generate clips");
  }

  const [{ value: frameRowCount }] = await db
    .select({ value: count() })
    .from(sceneFrames)
    .innerJoin(videoScenes, eq(sceneFrames.sceneId, videoScenes.id))
    .where(eq(videoScenes.videoProjectId, id));

  if (frameRowCount === 0) {
    return badRequest("No storyboard frames yet. Complete the storyboard before generating video.");
  }

  await db
    .update(videoProjects)
    .set({ status: "VIDEO_GENERATION" })
    .where(eq(videoProjects.id, id));

  await db
    .update(renderJobs)
    .set({ status: "ACTIVE", step: "MEDIA", progress: 0 })
    .where(eq(renderJobs.videoProjectId, id));

  await renderQueue.add("generate-frame-videos", {
    videoProjectId: id,
    userId: user.id,
    seriesId: video.seriesId,
  });

  return NextResponse.json({ success: true, status: "VIDEO_GENERATION" });
}
