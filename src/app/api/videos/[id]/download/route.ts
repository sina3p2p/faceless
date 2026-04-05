import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { getSignedDownloadUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await prisma.videoProject.findFirst({
    where: { id, series: { userId: user.id } },
  });

  if (!video) return notFound("Video not found");
  if (!video.outputUrl) return badRequest("Video not ready for download");

  const url = await getSignedDownloadUrl(video.outputUrl);

  return NextResponse.json({ url });
}
