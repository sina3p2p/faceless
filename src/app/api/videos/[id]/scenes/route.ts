import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
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
      scenes: { orderBy: asc(videoScenes.sceneOrder) },
      series: { columns: { userId: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const scenesWithUrls = await Promise.all(
    video.scenes.map(async (scene) => {
      const [audioUrl, assetUrl] = await Promise.all([
        scene.audioUrl ? getSignedDownloadUrl(scene.audioUrl) : null,
        scene.assetUrl ? getSignedDownloadUrl(scene.assetUrl) : null,
      ]);

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
        assetUrl,
      };
    })
  );

  return NextResponse.json({ scenes: scenesWithUrls });
}
