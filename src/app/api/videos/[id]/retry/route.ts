import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { enqueueRenderJob } from "@/lib/queue";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: { series: { columns: { id: true, userId: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");
  if (video.status !== "FAILED") return badRequest("Only failed videos can be retried");

  // Reset video state
  await db
    .update(videoProjects)
    .set({ status: "PENDING", outputUrl: null })
    .where(eq(videoProjects.id, id));

  // Delete old scenes (will be regenerated)
  await db
    .delete(videoScenes)
    .where(eq(videoScenes.videoProjectId, id));

  // Delete old render jobs
  await db
    .delete(renderJobs)
    .where(eq(renderJobs.videoProjectId, id));

  // Create fresh render job
  await db.insert(renderJobs).values({ videoProjectId: id });

  // Enqueue
  await enqueueRenderJob({
    videoProjectId: id,
    seriesId: video.series.id,
    userId: user.id,
  });

  return NextResponse.json({ retried: true });
}
