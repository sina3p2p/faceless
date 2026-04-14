import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames } from "@/server/db/schema";
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
      scenes: {
        orderBy: asc(videoScenes.sceneOrder),
        with: { frames: { orderBy: asc(sceneFrames.frameOrder) } },
      },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const totalFrames = video.scenes.reduce((sum, s) => sum + s.frames.length, 0);
  if (totalFrames === 0) return badRequest("No frames found — generate prompts first");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  if (parsed.data.regenerateExisting) {
    for (const scene of video.scenes) {
      for (const frame of scene.frames) {
        if (frame.imageMediaId) {
          await db
            .update(sceneFrames)
            .set({ imageMediaId: null, modelUsed: null })
            .where(eq(sceneFrames.id, frame.id));
        }
      }
    }
  }

  await db
    .update(videoProjects)
    .set({ status: "IMAGE_GENERATION" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("generate-frame-images", {
    videoProjectId: id,
    userId: user.id,
  });

  return NextResponse.json({ success: true, status: "IMAGE_GENERATION" });
}
