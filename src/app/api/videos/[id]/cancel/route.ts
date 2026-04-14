import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { renderQueue } from "@/lib/queue";

const CANCELLABLE_STATUSES = ["PENDING", "SCRIPT", "MUSIC_SCRIPT", "MUSIC_GENERATION", "VIDEO_SCRIPT", "IMAGE_GENERATION", "VIDEO_GENERATION", "RENDERING"];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  if (!CANCELLABLE_STATUSES.includes(video.status)) {
    return badRequest(`Cannot cancel a video with status "${video.status}"`);
  }

  // Remove any pending/waiting jobs from the queue
  const jobs = await renderQueue.getJobs(["waiting", "delayed", "active"]);
  for (const job of jobs) {
    if (job.data?.videoProjectId === id) {
      try {
        await job.remove();
      } catch {
        // Active jobs can't be directly removed; they'll check status on next step
        await job.moveToFailed(new Error("Cancelled by user"), "0");
      }
    }
  }

  await db
    .update(videoProjects)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(eq(videoProjects.id, id));

  await db
    .update(renderJobs)
    .set({ status: "FAILED", error: "Cancelled by user" })
    .where(eq(renderJobs.videoProjectId, id));

  return NextResponse.json({ success: true, status: "CANCELLED" });
}
