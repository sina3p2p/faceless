import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoStoryAssets } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { and, eq, ne } from "drizzle-orm";
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
    columns: { id: true, userId: true, status: true },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (video.status !== "REVIEW_HERO_ASSETS") {
    return badRequest(`Cannot approve hero assets while status is ${video.status}`);
  }

  // Block approval if any hero asset is still pending or rejected.
  const blockers = await db.query.videoStoryAssets.findMany({
    where: and(
      eq(videoStoryAssets.videoProjectId, id),
      ne(videoStoryAssets.approvalStatus, "approved")
    ),
  });
  if (blockers.length > 0) {
    return badRequest(
      `${blockers.length} hero asset(s) still need approval before continuing`
    );
  }

  await db
    .update(videoProjects)
    .set({ status: "STORYBOARD" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("storyboard", { videoProjectId: id, userId: user.id });

  return NextResponse.json({ success: true });
}
