import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, series, videoScenes, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and, asc, desc } from "drizzle-orm";
import { z } from "zod";

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
      series: { columns: { name: true, niche: true, style: true, imageModel: true, videoModel: true, videoType: true, sceneContinuity: true, userId: true } },
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
      videoModel: seriesData.videoModel,
      videoType: seriesData.videoType,
      sceneContinuity: seriesData.sceneContinuity,
    },
  });
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  REVIEW_SCRIPT: ["IMAGE_GENERATION"],
  IMAGE_GENERATION: ["IMAGE_REVIEW"],
  IMAGE_REVIEW: ["IMAGE_GENERATION", "VIDEO_GENERATION"],
  REVIEW_MUSIC_SCRIPT: ["MUSIC_GENERATION"],
  MUSIC_REVIEW: ["REVIEW_MUSIC_SCRIPT", "VIDEO_SCRIPT"],
  REVIEW_VISUAL: ["IMAGE_GENERATION"],
};

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  status: z.enum(["IMAGE_GENERATION", "IMAGE_REVIEW", "VIDEO_GENERATION", "MUSIC_GENERATION", "REVIEW_MUSIC_SCRIPT", "VIDEO_SCRIPT"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.status !== undefined) {
    const allowed = ALLOWED_STATUS_TRANSITIONS[video.status];
    if (!allowed || !allowed.includes(parsed.data.status)) {
      return badRequest(`Cannot transition from "${video.status}" to "${parsed.data.status}"`);
    }
    updates.status = parsed.data.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await db.update(videoProjects).set(updates).where(eq(videoProjects.id, id));

  return NextResponse.json({ ok: true });
}
