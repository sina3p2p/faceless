import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames, media } from "@/server/db/schema";
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
        with: {
          frames: {
            orderBy: asc(sceneFrames.frameOrder),
            with: { media: { orderBy: desc(media.createdAt) } },
          },
        },
      },
      series: { columns: { userId: true } },
    },
  });

  if (!video || video.series.userId !== user.id) return notFound("Video not found");

  const scenesWithFrames = await Promise.all(
    video.scenes.map(async (scene) => ({
      sceneId: scene.id,
      sceneOrder: scene.sceneOrder,
      sceneTitle: scene.sceneTitle,
      frames: await Promise.all(
        scene.frames.map(async (frame) => {
          let imageUrl: string | null = null;
          let videoUrl: string | null = null;

          if (frame.imageUrl) {
            try { imageUrl = await getSignedDownloadUrl(frame.imageUrl); } catch { /* skip */ }
          }
          if (frame.videoUrl) {
            try { videoUrl = await getSignedDownloadUrl(frame.videoUrl); } catch { /* skip */ }
          }

          const signedMedia = await Promise.all(
            (frame.media ?? []).map(async (m) => ({
              id: m.id,
              type: m.type,
              url: m.url.startsWith("http") ? m.url : await getSignedDownloadUrl(m.url).catch(() => m.url),
              prompt: m.prompt,
              modelUsed: m.modelUsed,
              createdAt: m.createdAt.toISOString(),
            }))
          );

          return {
            id: frame.id,
            frameOrder: frame.frameOrder,
            clipDuration: frame.clipDuration,
            imagePrompt: frame.imagePrompt,
            visualDescription: frame.visualDescription,
            assetRefs: frame.assetRefs,
            imageUrl,
            videoUrl,
            imageKey: frame.imageUrl,
            videoKey: frame.videoUrl,
            modelUsed: frame.modelUsed,
            media: signedMedia,
            imageGeneratedAt: frame.imageGeneratedAt?.toISOString() ?? null,
            videoGeneratedAt: frame.videoGeneratedAt?.toISOString() ?? null,
          };
        })
      ),
    }))
  );

  return NextResponse.json({ scenes: scenesWithFrames });
}
