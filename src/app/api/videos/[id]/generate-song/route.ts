import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects } from "@/server/db/schema";
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

  if (!["REVIEW_MUSIC_SCRIPT", "MUSIC_REVIEW"].includes(video.status)) {
    return badRequest(`Cannot generate song from status "${video.status}"`);
  }

  await db
    .update(videoProjects)
    .set({ status: "MUSIC_GENERATION" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("generate-song", {
    videoProjectId: id,
    userId: user.id,
  });

  return NextResponse.json({ success: true, status: "MUSIC_GENERATION" });
}
