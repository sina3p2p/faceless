import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { z } from "zod";

const reorderSchema = z.object({
  sceneIds: z.array(z.string()).min(1),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: { series: { columns: { userId: true } } },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const body = await req.json();
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid scene IDs");

  const { sceneIds } = parsed.data;

  await Promise.all(
    sceneIds.map((sceneId, index) =>
      db
        .update(videoScenes)
        .set({ sceneOrder: index })
        .where(eq(videoScenes.id, sceneId))
    )
  );

  return NextResponse.json({ success: true });
}
