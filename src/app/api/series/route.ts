import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";

const createSeriesSchema = z.object({
  name: z.string().min(1).max(100),
  niche: z.string().min(1),
  style: z.string().default("cinematic"),
  defaultVoiceId: z.string().optional(),
  llmModel: z.string().default("anthropic/claude-opus-4.6"),
  imageModel: z.string().default("dall-e-3"),
  videoModel: z.string().default("kling-3-standard"),
  sceneContinuity: z.boolean().default(false),
  captionStyle: z.string().default("default"),
  videoType: z.enum(["faceless", "ai_video"]).default("faceless"),
  topicIdeas: z.array(z.string()).default([]),
});

export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const rows = await db
    .select({
      id: series.id,
      name: series.name,
      niche: series.niche,
      style: series.style,
      captionStyle: series.captionStyle,
      createdAt: series.createdAt,
      videoCount: sql<number>`count(${videoProjects.id})::int`,
    })
    .from(series)
    .leftJoin(videoProjects, eq(videoProjects.seriesId, series.id))
    .where(eq(series.userId, user.id))
    .groupBy(series.id)
    .orderBy(desc(series.createdAt));

  const result = rows.map((r) => ({
    ...r,
    _count: { videoProjects: r.videoCount },
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = createSeriesSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest(parsed.error.message);
  }

  const { sceneContinuity, ...rest } = parsed.data;
  const [newSeries] = await db
    .insert(series)
    .values({
      ...rest,
      sceneContinuity: sceneContinuity ? 1 : 0,
      userId: user.id,
    })
    .returning();

  return NextResponse.json(newSeries, { status: 201 });
}
