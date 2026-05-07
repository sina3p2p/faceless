import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, asc, desc } from "drizzle-orm";
import { mediaUrl } from "@/lib/storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    with: {
      scenes: {
        orderBy: asc(videoScenes.sceneOrder),
        with: { media: { orderBy: desc(media.createdAt) } },
      },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const scenesWithUrls = video.scenes.map((scene) => ({
    id: scene.id,
    sceneOrder: scene.sceneOrder,
    text: scene.text,
    imagePrompt: scene.imagePrompt,
    visualDescription: scene.visualDescription,
    searchQuery: scene.searchQuery,
    duration: scene.duration,
    wordTimestamps: scene.captionData || [],
    audioUrl: mediaUrl(scene.audioUrl),
    assetUrl: null,
    imageUrl: null,
    videoUrl: null,
    media: (scene.media || []).map((m) => ({
      id: m.id,
      type: m.type,
      url: mediaUrl(m.url),
      key: m.url,
      prompt: m.prompt,
      modelUsed: m.modelUsed,
      createdAt: m.createdAt.toISOString(),
    })),
  }));

  return NextResponse.json({ scenes: scenesWithUrls });
}
