import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { getSignedDownloadUrl } from "@/lib/storage";
import { generateSingleFrameMotion } from "@/server/services/llm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; frameId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, frameId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: {
      series: { columns: { userId: true, style: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const frame = await db.query.sceneFrames.findFirst({
    where: eq(sceneFrames.id, frameId),
  });

  if (!frame) return notFound("Frame not found");
  if (!frame.imageUrl) {
    return NextResponse.json(
      { error: "Frame has no image. Generate an image first." },
      { status: 422 }
    );
  }

  // Find the scene this frame belongs to
  const allScenes = await db.query.videoScenes.findMany({
    where: eq(videoScenes.videoProjectId, videoId),
    orderBy: asc(videoScenes.sceneOrder),
  });

  const scene = await db.query.videoScenes.findFirst({
    where: eq(videoScenes.id, frame.sceneId),
  });

  if (!scene) return notFound("Parent scene not found");

  // Build the full ordered frame list to find the next frame
  const allFrames: Array<{ id: string; imageUrl: string | null; sceneId: string }> = [];
  for (const s of allScenes) {
    const frames = await db.query.sceneFrames.findMany({
      where: eq(sceneFrames.sceneId, s.id),
      orderBy: asc(sceneFrames.frameOrder),
      columns: { id: true, imageUrl: true, sceneId: true },
    });
    allFrames.push(...frames);
  }

  const currentIdx = allFrames.findIndex((f) => f.id === frameId);
  const nextFrame = currentIdx >= 0 && currentIdx + 1 < allFrames.length
    ? allFrames[currentIdx + 1]
    : null;

  try {
    const currentImageUrl = await getSignedDownloadUrl(frame.imageUrl);
    let nextImageUrl: string | null = null;
    if (nextFrame?.imageUrl) {
      try {
        nextImageUrl = await getSignedDownloadUrl(nextFrame.imageUrl);
      } catch { /* skip */ }
    }

    const result = await generateSingleFrameMotion(
      {
        imagePrompt: frame.imagePrompt || "",
        clipDuration: frame.clipDuration ?? 5,
        sceneText: scene.text,
        directorNote: scene.directorNote || "",
        sceneTitle: scene.sceneTitle || "",
      },
      currentImageUrl,
      nextImageUrl,
      undefined // uses default motionModel from constants
    );

    await db
      .update(sceneFrames)
      .set({ visualDescription: result.visualDescription })
      .where(eq(sceneFrames.id, frameId));

    return NextResponse.json({
      visualDescription: result.visualDescription,
    });
  } catch (err) {
    console.error(`Motion generation failed for frame ${frameId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Motion generation failed" },
      { status: 500 }
    );
  }
}
