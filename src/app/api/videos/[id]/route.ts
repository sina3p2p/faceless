import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await prisma.videoProject.findFirst({
    where: { id, series: { userId: user.id } },
    include: {
      scenes: { orderBy: { sceneOrder: "asc" } },
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
      series: { select: { name: true, niche: true } },
    },
  });

  if (!video) return notFound("Video not found");

  return NextResponse.json(video);
}
