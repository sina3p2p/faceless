import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
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
    with: { series: { columns: { id: true, userId: true, videoType: true } } },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (video.status !== "FAILED") return badRequest("Only failed videos can be retried");

  await db
    .update(videoProjects)
    .set({ status: "PENDING", outputUrl: null })
    .where(eq(videoProjects.id, id));

  await db
    .delete(videoScenes)
    .where(eq(videoScenes.videoProjectId, id));

  await db
    .delete(renderJobs)
    .where(eq(renderJobs.videoProjectId, id));

  await db.insert(renderJobs).values({ videoProjectId: id });

  await renderQueue.add("generate-story", {
    videoProjectId: id,
    userId: user.id,
  });

  return NextResponse.json({ retried: true });
}
