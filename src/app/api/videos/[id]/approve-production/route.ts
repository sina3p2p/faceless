import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { enqueueAfterReviewGate } from "@/lib/pipeline-advance";

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

  if (!video || video.userId !== user.id) return notFound("Video not found");

  await enqueueAfterReviewGate(id, "REVIEW_PRODUCTION", { userId: user.id });

  return NextResponse.json({ success: true });
}
