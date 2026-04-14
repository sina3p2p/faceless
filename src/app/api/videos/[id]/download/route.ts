import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { getSignedDownloadUrl } from "@/lib/storage";
import { eq } from "drizzle-orm";

export async function GET(
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

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (!video.outputUrl) return badRequest("Video not ready for download");

  const url = await getSignedDownloadUrl(video.outputUrl);

  return NextResponse.json({ url });
}
