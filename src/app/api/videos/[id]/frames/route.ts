import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, sceneFrames, media } from "@/server/db/schema";
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
        with: {
          frames: {
            orderBy: asc(sceneFrames.frameOrder),
            with: {
              imageMedia: true,
              videoMedia: true,
              media: { orderBy: desc(media.createdAt) },
            },
          },
        },
      },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const scenesWithFrames = video.scenes.map((scene) => ({
    sceneId: scene.id,
    sceneOrder: scene.sceneOrder,
    sceneTitle: scene.sceneTitle,
    frames: scene.frames.map((frame) => ({
      id: frame.id,
      frameOrder: frame.frameOrder,
      clipDuration: frame.clipDuration,
      imagePrompt: frame.imagePrompt,
      imageSpec: frame.imageSpec,
      promptContractMeta: frame.promptContractMeta,
      motionSpec: frame.motionSpec,
      visualDescription: frame.visualDescription,
      assetRefs: frame.assetRefs,
      media: (frame.media ?? []).map((m) => ({
        id: m.id,
        type: m.type,
        url: mediaUrl(m.url),
        prompt: m.prompt,
        modelUsed: m.modelUsed,
        createdAt: m.createdAt.toISOString(),
      })),
      imageMediaId: frame.imageMediaId,
      videoMediaId: frame.videoMediaId,
    })),
  }));

  return NextResponse.json({ scenes: scenesWithFrames });
}
