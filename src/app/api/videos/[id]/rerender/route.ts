import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
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
    with: { series: { columns: { userId: true, id: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  await db
    .update(videoProjects)
    .set({ status: "RENDERING" })
    .where(eq(videoProjects.id, id));

  await db.insert(renderJobs).values({
    videoProjectId: id,
    step: "COMPOSE",
    status: "QUEUED",
    progress: 0,
  });

  await renderQueue.add("rerender-video", {
    videoProjectId: id,
    seriesId: video.series.id,
    userId: user.id,
  });

  return NextResponse.json({ success: true });
}
