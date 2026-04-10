import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series, renderJobs } from "@/server/db/schema";
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
      series: { columns: { userId: true, id: true } },
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  if (video.scenes.length === 0) {
    return badRequest("No scenes to render");
  }

  await db
    .update(videoProjects)
    .set({ status: "VIDEO_GENERATION" })
    .where(eq(videoProjects.id, id));

  await db
    .update(renderJobs)
    .set({ status: "ACTIVE", step: "TTS", progress: 0 })
    .where(eq(renderJobs.videoProjectId, id));

  const seriesRecord = await db.query.series.findFirst({
    where: eq(series.id, video.series.id),
    columns: { videoType: true },
  });

  await renderQueue.add("render-from-scenes", {
    videoProjectId: id,
    seriesId: video.series.id,
    userId: user.id,
  });

  return NextResponse.json({ success: true, status: "VIDEO_GENERATION" });
}
