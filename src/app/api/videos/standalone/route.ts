import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { linkStoryAssetsToVideo } from "@/server/db/story-assets";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { firstJob, resolveVideoType } from "@/worker/pipeline/topology";
import { IMAGE_MODEL_IDS, LLM_MODEL_IDS, MODEL_SETTINGS, VIDEO_MODEL_IDS } from "@/lib/constants";
import type { PipelineConfig } from "@/types/pipeline";
import { z } from "zod/v4";
import { generateSeed } from "@/lib/seed";

const modelId = z.string().min(1);
const textModelOpt = z.enum(LLM_MODEL_IDS);

const standaloneSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  videoType: z.enum(["standalone", "music_video", "movie", "timelapse"]).default("standalone"),
  /** English style string for AI music generation when `videoType` is music_video. */
  musicGenre: z.string().min(1).max(500).optional(),
  style: z.string().default("cinematic"),
  videoSize: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
  voiceId: z.string().optional(),
  language: z.string().default("en"),
  captionStyle: z.string().default("none"),
  modelSettings: z.object({
    storyModel: textModelOpt,
    directorModel: textModelOpt,
    supervisorModel: textModelOpt,
    cinematographerModel: textModelOpt,
    storyboardModel: textModelOpt,
    producerModel: textModelOpt,
    promptModel: textModelOpt,
    motionModel: textModelOpt,
    researchModel: textModelOpt,
    imageModel: z.enum(IMAGE_MODEL_IDS),
    videoModel: z.enum(VIDEO_MODEL_IDS),
  }),
  videoResolution: z.enum(["360p", "480p", "540p", "720p", "1080p", "4k"]),
  duration: z.number().min(10).max(180),
  /** Existing canonical story_assets ids (your library); linked to this video in order. */
  storyAssetIds: z.array(z.string()).optional().default([]),
  /** When true, run Tavily-backed web research after the creative brief and before story. */
  webResearch: z.boolean().optional().default(false),
  /** Falls back for any omitted text model when the top-level *Model field is not sent. */
  llmModel: modelId.optional(),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = standaloneSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const usage = await checkUsageLimit(user.id);
  if (!usage.allowed) {
    return NextResponse.json(
      { error: "Monthly video limit reached", used: usage.used, limit: usage.limit },
      { status: 429 }
    );
  }

  const data = parsed.data;

  const config: Record<string, unknown> = {};
  if (data.duration) {
    config.duration = {
      min: Math.round(data.duration * 0.7),
      preferred: data.duration,
      max: Math.round(data.duration * 1.33),
    };
  }
  if (data.videoType === "music_video" && data.musicGenre?.trim()) {
    config.musicGenre = data.musicGenre.trim();
  }
  if (data.webResearch) {
    config.webResearch = true;
  }
  const hasConfig = Object.keys(config).length > 0;

  const [videoProject] = await db
    .insert(videoProjects)
    .values({
      status: "PENDING",
      modelSettings: {
        ...MODEL_SETTINGS,
        ...data.modelSettings
      },
      videoResolution: data.videoResolution,
      videoSize: data.videoSize,
      language: data.language,
      videoType: data.videoType,
      style: data.style,
      userId: user.id,
      idea: data.prompt,
      voiceId: data.voiceId,
      config: hasConfig ? config : undefined,
      seed: generateSeed()
    })
    .returning();

  if (data.storyAssetIds.length > 0) {
    await linkStoryAssetsToVideo(user.id, videoProject.id, data.storyAssetIds);
  }

  await db.insert(renderJobs).values({ videoProjectId: videoProject.id });

  const startJob = firstJob({
    videoType: resolveVideoType(data.videoType),
    config: (hasConfig ? config : {}) as PipelineConfig,
  });

  await renderQueue.add(startJob, {
    videoProjectId: videoProject.id,
    userId: user.id,
    seriesId: "",
  });

  return NextResponse.json(
    { videoId: videoProject.id },
    { status: 201 }
  );
}
