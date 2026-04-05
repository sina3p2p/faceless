import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { enqueueRenderJob } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { z } from "zod/v4";

const createVideoSchema = z.object({
  seriesId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get("seriesId");

  const videos = await prisma.videoProject.findMany({
    where: {
      series: { userId: user.id },
      ...(seriesId && { seriesId }),
    },
    include: {
      renderJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(videos);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = createVideoSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const series = await prisma.series.findFirst({
    where: { id: parsed.data.seriesId, userId: user.id },
  });
  if (!series) return badRequest("Series not found");

  const usage = await checkUsageLimit(user.id);
  if (!usage.allowed) {
    return NextResponse.json(
      {
        error: "Monthly video limit reached",
        used: usage.used,
        limit: usage.limit,
      },
      { status: 429 }
    );
  }

  const videoProject = await prisma.videoProject.create({
    data: { seriesId: series.id, status: "PENDING" },
  });

  await prisma.renderJob.create({
    data: { videoProjectId: videoProject.id },
  });

  await enqueueRenderJob({
    videoProjectId: videoProject.id,
    seriesId: series.id,
    userId: user.id,
  });

  return NextResponse.json(videoProject, { status: 201 });
}
