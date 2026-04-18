import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
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
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (!video.seriesId) return badRequest("Cannot compose without a series.");

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

  await renderQueue.add("compose-final", {
    videoProjectId: id,
    userId: user.id,
    seriesId: video.seriesId,
  });

  return NextResponse.json({ success: true });
}
