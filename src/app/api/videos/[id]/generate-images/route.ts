import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { renderQueue } from "@/lib/queue";
import { z } from "zod";

const bodySchema = z.object({
  regenerateExisting: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      series: { columns: { userId: true, id: true } },
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");
  if (video.scenes.length === 0) return badRequest("No scenes found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  await db
    .update(videoProjects)
    .set({ status: "IMAGE_GENERATION" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("generate-images", {
    videoProjectId: id,
    userId: user.id,
    regenerateExisting: parsed.data.regenerateExisting,
  });

  return NextResponse.json({ success: true, status: "IMAGE_GENERATION" });
}
