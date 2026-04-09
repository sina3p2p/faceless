import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { z } from "zod/v4";

const standaloneSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  videoType: z.enum(["faceless", "ai_video", "music_video", "dialogue"]).default("ai_video"),
  style: z.string().default("cinematic"),
  imageModel: z.string().default("dall-e-3"),
  videoModel: z.string().default("kling-3-standard"),
  videoSize: z.string().default("9:16"),
  llmModel: z.string().default("anthropic/claude-opus-4.6"),
  voiceId: z.string().optional(),
  language: z.string().default("en"),
  captionStyle: z.string().default("none"),
  sceneContinuity: z.boolean().default(true),
  targetDuration: z.number().min(10).max(180).optional(),
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
  let storyAssets: Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string }> = [];
  const characterImages: Array<{ url: string; description: string; voiceId?: string }> = [];

  if (data.storyAssets && data.storyAssets.length > 0) {
    storyAssets = data.storyAssets.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      description: a.description,
      url: a.imageUrl,
    }));
    // Also build legacy characterImages for backward compat
    for (const a of data.storyAssets) {
      characterImages.push({
        url: a.imageUrl,
        description: a.name ? `${a.name}: ${a.description}` : a.description,
        ...(a.voiceId ? { voiceId: a.voiceId } : {}),
      });
    }
  } else if (data.characters && data.characters.length > 0) {
    // Legacy path: auto-migrate characters to storyAssets
    for (const c of data.characters) {
      const id = crypto.randomUUID();
      storyAssets.push({
        id,
        type: "character",
        name: c.name || "Character",
        description: c.description,
        url: c.imageUrl,
      });
      characterImages.push({
        url: c.imageUrl,
        description: c.name ? `${c.name}: ${c.description}` : c.description,
        ...(c.voiceId ? { voiceId: c.voiceId } : {}),
      });
    }
  }

  const [internalSeries] = await db
    .insert(series)
    .values({
      userId: user.id,
      name: seriesName,
      niche: "custom",
      style: data.style,
      defaultVoiceId: data.voiceId || null,
      llmModel: data.llmModel,
      imageModel: data.imageModel,
      videoModel: data.videoModel,
      videoSize: data.videoSize,
      language: data.language,
      captionStyle: data.captionStyle,
      sceneContinuity: data.sceneContinuity ? 1 : 0,
      videoType: data.videoType,
      characterImages,
      storyAssets,
      isInternal: true,
      topicIdeas: [data.prompt],
    })
    .returning();

  const config = data.targetDuration
    ? { targetDuration: data.targetDuration }
    : undefined;

  const [videoProject] = await db
    .insert(videoProjects)
    .values({ seriesId: internalSeries.id, status: "PENDING", config })
    .returning();

  await db.insert(renderJobs).values({ videoProjectId: videoProject.id });

  const jobName = data.videoType === "music_video"
    ? "generate-music-lyrics"
    : data.videoType === "dialogue"
      ? "generate-dialogue-script"
      : "generate-standalone-script";

  await renderQueue.add(jobName, {
    videoProjectId: videoProject.id,
    seriesId: internalSeries.id,
    userId: user.id,
  });

  return NextResponse.json(
    { videoId: videoProject.id, seriesId: internalSeries.id },
    { status: 201 }
  );
}
