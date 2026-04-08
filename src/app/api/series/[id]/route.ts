import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series, videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod/v4";

const updateSeriesSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  niche: z.string().min(1).optional(),
  style: z.string().optional(),
  captionStyle: z.string().optional(),
  language: z.string().optional(),
  videoType: z.enum(["faceless", "ai_video", "music_video", "dialogue"]).optional(),
  llmModel: z.string().optional(),
  imageModel: z.string().optional(),
  videoModel: z.string().optional(),
  videoSize: z.string().optional(),
  sceneContinuity: z.boolean().optional(),
  defaultVoiceId: z.string().nullable().optional(),
  topicIdeas: z.array(z.string()).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const result = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    with: {
      videoProjects: {
        orderBy: desc(videoProjects.createdAt),
        limit: 20,
        with: {
          renderJobs: {
            orderBy: desc(videoProjects.createdAt),
            limit: 1,
          },
        },
      },
    },
  });

  if (!result) return notFound("Series not found");

  return NextResponse.json(result);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
  });

  if (!existing) return notFound("Series not found");

  const body = await req.json();
  const parsed = updateSeriesSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { sceneContinuity, ...restUpdates } = parsed.data;
  const updates: Record<string, unknown> = { ...restUpdates };
  if (sceneContinuity !== undefined) updates.sceneContinuity = sceneContinuity ? 1 : 0;
  if (Object.keys(updates).length === 0) return badRequest("No fields to update");

  const [updated] = await db
    .update(series)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(series.id, id))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
  });

  if (!existing) return notFound("Series not found");

  await db.delete(series).where(eq(series.id, id));

  return NextResponse.json({ deleted: true });
}
