import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, serverError } from "@/lib/api-utils";
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
    return NextResponse.json(
      { error: "No scenes to render" },
      { status: 400 }
    );
  }

  await db
    .update(videoProjects)
    .set({ status: "RENDERING" })
    .where(eq(videoProjects.id, id));

  try {
    await renderQueue.add("rerender-video", {
      videoProjectId: id,
      seriesId: video.series.id,
      userId: user.id,
      rerender: true,
    });
  } catch (err) {
    console.error("Failed to queue re-render:", err);
    return serverError("Failed to queue re-render job");
  }

  return NextResponse.json({ success: true, status: "RENDERING" });
}
