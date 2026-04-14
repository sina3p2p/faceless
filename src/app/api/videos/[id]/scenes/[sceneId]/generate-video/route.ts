import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, videoScenes, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { getAIVideoForScene } from "@/server/services/ai/video";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  visualDescription: z.string().optional(),
  videoModel: z.string().optional(),
  duration: z.number().min(3).max(15).default(5),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, sceneId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: {
      series: {
        columns: { userId: true, videoModel: true, sceneContinuity: true },
      },
    },
  });

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const scene = await db.query.videoScenes.findFirst({
    where: and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)),
  });

  if (!scene) return notFound("Scene not found");

  const imgKey = scene.imageUrl || scene.assetUrl;
  if (!imgKey) {
    return NextResponse.json(
      { error: "Scene has no image. Generate an image first before creating a video clip." },
      { status: 422 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { duration } = parsed.data;
  const prompt = parsed.data.visualDescription || scene.visualDescription || scene.text;
  const videoModel = parsed.data.videoModel || video.series?.videoModel || undefined;

  try {
    const signedImageUrl = imgKey.startsWith("http")
      ? imgKey
      : await getSignedDownloadUrl(imgKey);

    let endImageUrl: string | undefined;
    if (video.series?.sceneContinuity) {
      const nextScene = await db.query.videoScenes.findFirst({
        where: and(
          eq(videoScenes.videoProjectId, videoId),
          eq(videoScenes.sceneOrder, scene.sceneOrder + 1)
        ),
      });
      const nextImgKey = nextScene?.imageUrl || nextScene?.assetUrl;
      if (nextImgKey) {
        endImageUrl = nextImgKey.startsWith("http")
          ? nextImgKey
          : await getSignedDownloadUrl(nextImgKey);
      }
    }

    const result = await getAIVideoForScene(signedImageUrl, prompt, duration, videoModel, endImageUrl);

    const videoResponse = await fetch(result.videoUrl);
    if (!videoResponse.ok) throw new Error("Failed to download generated video");
    const buffer = Buffer.from(await videoResponse.arrayBuffer());

    const key = `scenes/${videoId}/video_${sceneId}_${Date.now()}.mp4`;
    await uploadFile(key, buffer, "video/mp4");

    await db
      .update(videoScenes)
      .set({
        videoUrl: key,
        assetUrl: key,
        assetType: "video",
        modelUsed: videoModel || "kling-3-standard",
      })
      .where(and(eq(videoScenes.id, sceneId), eq(videoScenes.videoProjectId, videoId)));

    await db.insert(media).values({
      sceneId,
      type: "video",
      url: key,
      prompt,
      modelUsed: videoModel || "kling-3-standard",
      metadata: { duration: result.durationSeconds },
    });

    const signedUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({
      videoUrl: signedUrl,
      videoKey: key,
      videoModel: videoModel || "kling-3-standard",
      duration: result.durationSeconds,
    });
  } catch (err) {
    console.error(`Video generation failed for scene ${sceneId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video generation failed" },
      { status: 500 }
    );
  }
}
