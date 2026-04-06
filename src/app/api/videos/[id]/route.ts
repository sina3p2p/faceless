import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, series, videoScenes, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, and, asc, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
      renderJobs: { orderBy: desc(renderJobs.createdAt), limit: 1 },
      series: { columns: { name: true, niche: true, style: true, imageModel: true, videoType: true, userId: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const { series: seriesData, ...rest } = video;
  return NextResponse.json({
    ...rest,
    series: {
      name: seriesData.name,
      niche: seriesData.niche,
      style: seriesData.style,
      imageModel: seriesData.imageModel,
      videoType: seriesData.videoType,
    },
  });
}
