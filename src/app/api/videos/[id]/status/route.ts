import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, desc } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    columns: {
      id: true,
      status: true,
      title: true,
      outputUrl: true,
    },
    with: {
      renderJobs: {
        orderBy: desc(renderJobs.createdAt),
        limit: 1,
        columns: {
          step: true,
          status: true,
          progress: true,
          error: true,
          attempts: true,
        },
      },
      series: { columns: { userId: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const { series: _s, ...rest } = video;
  return NextResponse.json(rest);
}
