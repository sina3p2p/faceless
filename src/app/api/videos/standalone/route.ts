import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { z } from "zod/v4";

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
  characters: z
    .array(
      z.object({
        imageUrl: z.string(),
        name: z.string(),
        description: z.string(),
        voiceId: z.string().optional(),
      })
    )
    .optional(),
  storyAssets: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["character", "location", "prop"]),
        imageUrl: z.string(),
        name: z.string(),
        description: z.string(),
        sheetUrl: z.string().optional(),
        voiceId: z.string().optional(),
      })
    )
    .optional(),
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

  const seriesName = data.prompt.length > 50
    ? data.prompt.slice(0, 47) + "..."
    : data.prompt;

  // Build storyAssets from the new format, or auto-migrate from legacy characters
  let storyAssets: Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string; sheetUrl?: string }> = [];

  if (data.storyAssets && data.storyAssets.length > 0) {
    storyAssets = data.storyAssets.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      description: a.description,
      url: a.imageUrl,
      sheetUrl: a.sheetUrl,
    }));
  } else if (data.characters && data.characters.length > 0) {
    // Legacy path: auto-migrate characters to storyAssets
    for (const c of data.characters) {
      storyAssets.push({
        id: crypto.randomUUID(),
        type: "character",
        name: c.name || "Character",
        description: c.description,
        url: c.imageUrl,
      });
    }
  }

  // const [internalSeries] = await db
  //   .insert(series)
  //   .values({
  //     userId: user.id,
  //     name: seriesName,
  //     niche: "custom",
  //     style: data.style,
  //     defaultVoiceId: data.voiceId || null,
  //     llmModel: data.llmModel,
  //     imageModel: data.imageModel,
  //     videoModel: data.videoModel,
  //     videoSize: data.videoSize,
  //     language: data.language,
  //     captionStyle: data.captionStyle,
  //     sceneContinuity: data.sceneContinuity ? 1 : 0,
  //     videoType: data.videoType,
  //     storyAssets,
  //     isInternal: true,
  //     topicIdeas: [data.prompt],
  //   })
  //   .returning();

  const config: Record<string, unknown> | undefined = data.duration
    ? {
      duration: {
        min: data.duration.min ?? Math.round(data.duration.preferred * 0.7),
        preferred: data.duration.preferred,
        max: data.duration.max ?? Math.round(data.duration.preferred * 1.33),
        priority: data.duration.priority,
      },
    }
    : undefined;

  const [videoProject] = await db
    .insert(videoProjects)
    .values({
      status: "PENDING",
      llmModel: data.llmModel,
      imageModel: data.imageModel,
      videoModel: data.videoModel,
      videoSize: data.videoSize,
      config,
    })
    .returning();

  await db.insert(renderJobs).values({ videoProjectId: videoProject.id });

  await renderQueue.add("executive-produce", {
    videoProjectId: videoProject.id,
    userId: user.id,
  });

  return NextResponse.json(
    { videoId: videoProject.id },
    { status: 201 }
  );
}
