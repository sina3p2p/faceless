import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, asc, desc } from "drizzle-orm";
import { getSignedDownloadUrl } from "@/lib/storage";

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
      series: { columns: { userId: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const scenesWithUrls = await Promise.all(
    video.scenes.map(async (scene) => {
      const imgKey = scene.imageUrl || scene.assetUrl;
      const vidKey = scene.videoUrl;

      const [audioUrl, imageUrl, videoUrl] = await Promise.all([
        scene.audioUrl ? getSignedDownloadUrl(scene.audioUrl) : null,
        imgKey ? getSignedDownloadUrl(imgKey) : null,
        vidKey ? getSignedDownloadUrl(vidKey) : null,
      ]);

      const mediaItems = await Promise.all(
        (scene.media || []).map(async (m) => ({
          id: m.id,
          type: m.type,
          url: await getSignedDownloadUrl(m.url),
          key: m.url,
          prompt: m.prompt,
          modelUsed: m.modelUsed,
          createdAt: m.createdAt.toISOString(),
        }))
      );

      return {
        id: scene.id,
        sceneOrder: scene.sceneOrder,
        text: scene.text,
        imagePrompt: scene.imagePrompt,
        visualDescription: scene.visualDescription,
        searchQuery: scene.searchQuery,
        duration: scene.duration,
        assetType: scene.assetType,
        wordTimestamps: scene.captionData || [],
        audioUrl,
        assetUrl: imageUrl || videoUrl,
        imageUrl,
        videoUrl,
        imageKey: imgKey,
        videoKey: vidKey,
        media: mediaItems,
      };
    })
  );

  return NextResponse.json({ scenes: scenesWithUrls });
}
