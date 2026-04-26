import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { linkStoryAssetsToVideo } from "@/server/db/story-assets";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { DEFAULT_LLM_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@/lib/constants";
import type { ModelSettings } from "@/types/llm-common";
import { z } from "zod/v4";

const modelId = z.string().min(1);
const textModelOpt = z.string().min(1).optional();
const mediaModelOpt = z.string().min(1).optional();

const standaloneSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  videoType: z.enum(["standalone", "music_video", "dialogue"]).default("standalone"),
  /** English style string for AI music generation when `videoType` is music_video. */
  musicGenre: z.string().min(1).max(500).optional(),
  style: z.string().default("cinematic"),
  videoSize: z.string().default("9:16"),
  voiceId: z.string().optional(),
  language: z.string().default("en"),
  captionStyle: z.string().default("none"),
  sceneContinuity: z.boolean().default(true),
  /**
   * Top-level `*Model` fields = request body (matches `ModelSettings` + `producerModel`).
   * Omitted text fields are filled from `llmModel` (legacy) or `agentModels` or defaults.
   */
  storyModel: textModelOpt,
  directorModel: textModelOpt,
  supervisorModel: textModelOpt,
  cinematographerModel: textModelOpt,
  storyboardModel: textModelOpt,
  promptModel: textModelOpt,
  motionModel: textModelOpt,
  imageModel: mediaModelOpt,
  videoModel: mediaModelOpt,
  /** Executive producer; stored in `config.agentModels.producerModel`, not in `ModelSettings`. */
  producerModel: z.string().min(1).optional(),
  duration: z.object({
    preferred: z.number().min(10).max(180),
    min: z.number().min(5).max(180).optional(),
    max: z.number().min(10).max(300).optional(),
    priority: z.enum(["quality", "duration"]).default("quality"),
  }).optional(),
  /** Existing canonical story_assets ids (your library); linked to this video in order. */
  storyAssetIds: z.array(z.string()).optional().default([]),
  /** When true, run Tavily-backed web research after the creative brief and before story. */
  webResearch: z.boolean().optional().default(false),
  /** Falls back for any omitted text model when the top-level *Model field is not sent. */
  llmModel: modelId.optional(),
  /**
   * @deprecated Prefer top-level *Model. When present, fills gaps like `llmModel`.
   * If only this is sent, use with `llmModel` to populate `ModelSettings`.
   */
  agentModels: z
    .object({
      producerModel: modelId.optional(),
      storyModel: modelId.optional(),
      directorModel: modelId.optional(),
      supervisorModel: modelId.optional(),
      cinematographerModel: modelId.optional(),
      storyboardModel: modelId.optional(),
      promptModel: modelId.optional(),
      motionModel: modelId.optional(),
    })
    .optional(),
});

type ParsedStandalone = z.infer<typeof standaloneSchema>;

function resolveTextModel(
  p: ParsedStandalone,
  k: "storyModel" | "directorModel" | "supervisorModel" | "cinematographerModel" | "storyboardModel" | "promptModel" | "motionModel"
) {
  const a = p.agentModels;
  const one = p.llmModel ?? DEFAULT_LLM_MODEL;
  return p[k] ?? a?.[k] ?? one;
}

function resolveProducer(p: ParsedStandalone) {
  const a = p.agentModels;
  const one = p.llmModel ?? DEFAULT_LLM_MODEL;
  return p.producerModel ?? a?.producerModel ?? one;
}

function buildModelSettings(p: ParsedStandalone): ModelSettings {
  return {
    storyModel: resolveTextModel(p, "storyModel"),
    directorModel: resolveTextModel(p, "directorModel"),
    supervisorModel: resolveTextModel(p, "supervisorModel"),
    cinematographerModel: resolveTextModel(p, "cinematographerModel"),
    storyboardModel: resolveTextModel(p, "storyboardModel"),
    promptModel: resolveTextModel(p, "promptModel"),
    motionModel: resolveTextModel(p, "motionModel"),
    imageModel: p.imageModel ?? DEFAULT_IMAGE_MODEL,
    videoModel: p.videoModel ?? DEFAULT_VIDEO_MODEL,
  };
}

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
  const modelSettings = buildModelSettings(data);
  const producerResolved = resolveProducer(data);

  const config: Record<string, unknown> = {};
  if (data.duration) {
    config.duration = {
      min: data.duration.min ?? Math.round(data.duration.preferred * 0.7),
      preferred: data.duration.preferred,
      max: data.duration.max ?? Math.round(data.duration.preferred * 1.33),
      priority: data.duration.priority,
    };
  }
  if (data.agentModels) {
    config.agentModels = {
      ...data.agentModels,
      producerModel: data.agentModels.producerModel ?? producerResolved,
    };
  } else {
    config.agentModels = { producerModel: producerResolved };
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
      modelSettings,
      llmModel: modelSettings.storyModel,
      imageModel: modelSettings.imageModel,
      videoModel: modelSettings.videoModel,
      videoSize: data.videoSize,
      language: data.language,
      videoType: data.videoType,
      style: data.style,
      userId: user.id,
      idea: data.prompt,
      voiceId: data.voiceId,
      config: hasConfig ? config : undefined,
      sceneContinuity: data.sceneContinuity ? 1 : 0,
    })
    .returning();

  if (data.storyAssetIds.length > 0) {
    await linkStoryAssetsToVideo(user.id, videoProject.id, data.storyAssetIds);
  }

  await db.insert(renderJobs).values({ videoProjectId: videoProject.id });

  await renderQueue.add("executive-produce", {
    videoProjectId: videoProject.id,
    userId: user.id,
    seriesId: "",
  });

  return NextResponse.json(
    { videoId: videoProject.id },
    { status: 201 }
  );
}
