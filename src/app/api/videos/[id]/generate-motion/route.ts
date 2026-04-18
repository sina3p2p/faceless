import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames } from "@/server/db/schema";
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
      scenes: {
        orderBy: asc(videoScenes.sceneOrder),
        with: { frames: { orderBy: asc(sceneFrames.frameOrder) } },
      },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (video.scenes.length === 0) return badRequest("No scenes found");

  const allFrames = video.scenes.flatMap((s) => s.frames ?? []);
  if (allFrames.length === 0) {
    return badRequest("No frames — complete storyboard and frame images before generating motion");
  }

  const framesWithoutImages = allFrames.filter((f) => !f.imageMediaId);
  if (framesWithoutImages.length > 0) {
    return badRequest(
      `${framesWithoutImages.length} frame(s) still need images before generating motion`
    );
  }

  const seriesId = video.seriesId ?? "";
  if (!seriesId) {
    return badRequest("Video has no series — cannot run motion generation");
  }

  await db
    .update(videoProjects)
    .set({ status: "VIDEO_SCRIPT" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("generate-pipeline-motion", {
    videoProjectId: id,
    userId: user.id,
    seriesId,
  });

  return NextResponse.json({ success: true, status: "VIDEO_SCRIPT" });
}
