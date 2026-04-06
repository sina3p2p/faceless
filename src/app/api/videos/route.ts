import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod/v4";

const createVideoSchema = z.object({
  seriesId: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get("seriesId");

  const userSeries = await db.query.series.findMany({
    where: eq(series.userId, user.id),
    columns: { id: true },
  });
  const seriesIds = userSeries.map((s) => s.id);

  if (seriesIds.length === 0) return NextResponse.json([]);

  const videos = await db.query.videoProjects.findMany({
    where: seriesId
      ? and(eq(videoProjects.seriesId, seriesId))
      : undefined,
    with: {
      renderJobs: {
        orderBy: desc(renderJobs.createdAt),
        limit: 1,
      },
    },
    orderBy: desc(videoProjects.createdAt),
    limit: 50,
  });

  const filtered = videos.filter((v) => seriesIds.includes(v.seriesId));

  return NextResponse.json(filtered);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = createVideoSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const seriesRecord = await db.query.series.findFirst({
    where: and(eq(series.id, parsed.data.seriesId), eq(series.userId, user.id)),
  });
  if (!seriesRecord) return badRequest("Series not found");

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

  const [videoProject] = await db
    .insert(videoProjects)
    .values({ seriesId: seriesRecord.id, status: "PENDING" })
    .returning();

  await db.insert(renderJobs).values({ videoProjectId: videoProject.id });

  const jobName = seriesRecord.videoType === "music_video"
    ? "generate-music-script"
    : "generate-script";

  await renderQueue.add(jobName, {
    videoProjectId: videoProject.id,
    seriesId: seriesRecord.id,
    userId: user.id,
  });

  return NextResponse.json(videoProject, { status: 201 });
}
