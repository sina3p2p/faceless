import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, renderJobs } from "@/server/db/schema";
import { linkStoryAssetsToVideo } from "@/server/db/story-assets";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { z } from "zod/v4";

const modelId = z.string().min(1);
const optionalAgentModels = z
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
  .optional();

const standaloneSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  videoType: z.enum(["standalone", "music_video", "dialogue"]).default("standalone"),
  style: z.string().default("cinematic"),
  imageModel: z.string().default("dall-e-3"),
  videoModel: z.string().default("kling-3-standard"),
  videoSize: z.string().default("9:16"),
  llmModel: z.string().default("anthropic/claude-opus-4.6"),
  voiceId: z.string().optional(),
  language: z.string().default("en"),
  captionStyle: z.string().default("none"),
  sceneContinuity: z.boolean().default(true),
  duration: z.object({
    preferred: z.number().min(10).max(180),
    min: z.number().min(5).max(180).optional(),
    max: z.number().min(10).max(300).optional(),
    priority: z.enum(["quality", "duration"]).default("quality"),
  }).optional(),
  /** Existing canonical story_assets ids (your library); linked to this video in order. */
  storyAssetIds: z.array(z.string()).optional().default([]),
  /** Set when the user customizes per pipeline step; merged into `config.agentModels`. */
  agentModels: optionalAgentModels,
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
      min: data.duration.min ?? Math.round(data.duration.preferred * 0.7),
      preferred: data.duration.preferred,
      max: data.duration.max ?? Math.round(data.duration.preferred * 1.33),
      priority: data.duration.priority,
    };
  }
  if (data.agentModels) {
    config.agentModels = data.agentModels;
  }
  const hasConfig = Object.keys(config).length > 0;

  const [videoProject] = await db
    .insert(videoProjects)
    .values({
      status: "PENDING",
      llmModel: data.llmModel,
      imageModel: data.imageModel,
      videoModel: data.videoModel,
      videoSize: data.videoSize,
      language: data.language,
      videoType: data.videoType,
      style: data.style,
      userId: user.id,
      idea: data.prompt,
      config: hasConfig ? config : undefined,
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
