import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects, renderJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { renderQueue } from "@/lib/queue";
import { checkUsageLimit } from "@/lib/usage";
import { z } from "zod/v4";

const standaloneSchema = z.object({
  prompt: z.string().min(1, "Prompt is required"),
  videoType: z.enum(["faceless", "ai_video", "music_video"]).default("ai_video"),
  style: z.string().default("cinematic"),
  imageModel: z.string().default("dall-e-3"),
  videoModel: z.string().default("kling-3-standard"),
  llmModel: z.string().default("anthropic/claude-opus-4.6"),
  voiceId: z.string().optional(),
  language: z.string().default("en"),
  captionStyle: z.string().default("default"),
  sceneContinuity: z.boolean().default(true),
  targetDuration: z.number().min(10).max(180).optional(),
  characters: z
    .array(
      z.object({
        imageUrl: z.string(),
        name: z.string(),
        description: z.string(),
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

  const characterImages = (data.characters ?? []).map((c) => ({
    url: c.imageUrl,
    description: c.name ? `${c.name}: ${c.description}` : c.description,
  }));

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
      language: data.language,
      captionStyle: data.captionStyle,
      sceneContinuity: data.sceneContinuity ? 1 : 0,
      videoType: data.videoType,
      characterImages,
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
    ? "generate-standalone-music-script"
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
