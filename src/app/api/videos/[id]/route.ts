import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { and, asc, desc, eq } from "drizzle-orm";
import { listStoryAssetsForSeries, listStoryAssetsForVideo } from "@/server/db/story-assets";
import { z } from "zod";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: and(eq(videoProjects.id, id), eq(videoProjects.userId, user.id)),
    with: {
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
      renderJobs: { orderBy: desc(renderJobs.createdAt), limit: 1 },
      series: {
        columns: {
          name: true,
          niche: true,
          style: true,
          imageModel: true,
          videoModel: true,
          videoSize: true,
          videoType: true,
          sceneContinuity: true,
          userId: true,
        },
      },
    },
  });

  if (!video) return notFound("Video not found");

  const videoStoryAssets = await listStoryAssetsForVideo(id);
  const seriesStoryAssets =
    video.seriesId != null ? await listStoryAssetsForSeries(video.seriesId) : [];
  const { series: seriesRow, ...rest } = video;
  return NextResponse.json({
    ...rest,
    storyAssets: videoStoryAssets,
    series: seriesRow
      ? { ...seriesRow, storyAssets: seriesStoryAssets }
      : seriesRow,
  });
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  // Pipeline review gates
  REVIEW_STORY: ["TTS_GENERATION"],
  REVIEW_PRE_PRODUCTION: ["PROMPT_GENERATION"],
  REVIEW_IMAGES: ["MOTION_GENERATION"],
  REVIEW_PRODUCTION: ["RENDERING"],
  // Legacy transitions (for existing data)
  REVIEW_SCENES: ["TTS_GENERATION", "SCENE_SPLIT"],
  TTS_REVIEW: ["PROMPT_GENERATION", "TTS_GENERATION"],
  REVIEW_PROMPTS: ["IMAGE_GENERATION", "PROMPT_GENERATION"],
  IMAGE_REVIEW: ["IMAGE_GENERATION", "MOTION_GENERATION"],
  REVIEW_MOTION: ["MOTION_GENERATION", "VIDEO_GENERATION"],
  REVIEW_SCRIPT: ["IMAGE_GENERATION"],
  REVIEW_VISUAL: ["VIDEO_SCRIPT", "VIDEO_GENERATION"],
  REVIEW_MUSIC_SCRIPT: ["MUSIC_GENERATION"],
  MUSIC_REVIEW: ["REVIEW_MUSIC_SCRIPT", "VIDEO_SCRIPT"],
};

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  script: z.string().optional(),
  pipelineMode: z.enum(["manual", "auto"]).optional(),
  status: z.enum([
    // Pipeline review gates
    "REVIEW_STORY", "TTS_GENERATION",
    "REVIEW_PRE_PRODUCTION", "PROMPT_GENERATION",
    "REVIEW_IMAGES", "MOTION_GENERATION",
    "REVIEW_PRODUCTION", "RENDERING",
    // Legacy
    "SCENE_SPLIT", "REVIEW_SCENES",
    "TTS_REVIEW", "REVIEW_PROMPTS",
    "IMAGE_GENERATION", "IMAGE_REVIEW",
    "MOTION_GENERATION", "REVIEW_MOTION",
    "VIDEO_GENERATION",
    "REVIEW_VISUAL", "MUSIC_GENERATION", "REVIEW_MUSIC_SCRIPT",
  ]).optional(),
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

  if (!video) return notFound("Video not found");

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const updates: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.script !== undefined) updates.script = parsed.data.script;
  if (parsed.data.pipelineMode !== undefined) {
    const existingConfig = (video as Record<string, unknown>).config as Record<string, unknown> || {};
    updates.config = { ...existingConfig, pipelineMode: parsed.data.pipelineMode };
  }
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
