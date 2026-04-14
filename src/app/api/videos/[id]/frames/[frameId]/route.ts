import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateSchema = z.object({
  imagePrompt: z.string().optional(),
  visualDescription: z.string().optional(),
  clipDuration: z.number().min(1).max(30).optional(),
  assetRefs: z.array(z.string()).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; frameId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, frameId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series?.userId !== user.id) return notFound("Video not found");

  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const updates: Record<string, unknown> = {};
  if (parsed.data.imagePrompt !== undefined) updates.imagePrompt = parsed.data.imagePrompt;
  if (parsed.data.visualDescription !== undefined) {
    updates.visualDescription = parsed.data.visualDescription;
    updates.motionSpec = null;
  }
  if (parsed.data.clipDuration !== undefined) updates.clipDuration = parsed.data.clipDuration;
  if (parsed.data.assetRefs !== undefined) updates.assetRefs = parsed.data.assetRefs;

  if (Object.keys(updates).length === 0) {
    return badRequest("No updates provided");
  }

  await db
    .update(sceneFrames)
    .set(updates)
    .where(eq(sceneFrames.id, frameId));

  return NextResponse.json({ success: true });
}
