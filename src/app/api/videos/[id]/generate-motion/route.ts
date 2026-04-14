import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { renderQueue } from "@/lib/queue";

export async function POST(
  _req: NextRequest,
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

  const scenesWithoutImages = video.scenes.filter(
    (s) => !s.imageUrl && !s.assetUrl
  );
  if (scenesWithoutImages.length > 0) {
    return badRequest(`${scenesWithoutImages.length} scenes still need images before generating motion`);
  }

  await db
    .update(videoProjects)
    .set({ status: "VIDEO_SCRIPT" })
    .where(eq(videoProjects.id, id));

  await renderQueue.add("generate-motion", {
    videoProjectId: id,
    userId: user.id,
  });

  return NextResponse.json({ success: true, status: "VIDEO_SCRIPT" });
}
