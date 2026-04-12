import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { getAIVideoForScene } from "@/server/services/ai-video";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { z } from "zod";

const bodySchema = z.object({
  visualDescription: z.string().optional(),
  videoModel: z.string().optional(),
  duration: z.number().min(3).max(15).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; frameId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, frameId } = await params;

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoId),
    with: {
      series: {
        columns: { userId: true, videoModel: true, style: true },
      },
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

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const duration = parsed.data.duration || Math.max(3, Math.round(frame.clipDuration ?? 5));
  const motionPrompt = parsed.data.visualDescription || frame.visualDescription || "Cinematic motion";
  const videoModel = parsed.data.videoModel || video.series.videoModel || undefined;
  const prompt = motionPrompt;

  try {
    const signedImageUrl = frame.imageUrl.startsWith("http")
      ? frame.imageUrl
      : await getSignedDownloadUrl(frame.imageUrl);

    const result = await getAIVideoForScene(signedImageUrl, prompt, duration, videoModel);

    const videoResponse = await fetch(result.videoUrl);
    if (!videoResponse.ok) throw new Error("Failed to download generated video");
    const buffer = Buffer.from(await videoResponse.arrayBuffer());

    const key = `frames/${videoId}/video_${frameId}_${Date.now()}.mp4`;
    await uploadFile(key, buffer, "video/mp4");

    // Preserve current video as a variant before overwriting
    const existingVariants = (frame.videoVariants as Array<{ id: string; url: string; modelUsed: string | null; createdAt: string }>) ?? [];
    if (frame.videoUrl) {
      existingVariants.push({
        id: crypto.randomUUID(),
        url: frame.videoUrl,
        modelUsed: frame.modelUsed,
        createdAt: frame.createdAt.toISOString(),
      });
    }

    await db
      .update(sceneFrames)
      .set({ videoUrl: key, videoVariants: existingVariants, videoGeneratedAt: new Date() })
      .where(eq(sceneFrames.id, frameId));

    const signedUrl = await getSignedDownloadUrl(key);

    return NextResponse.json({
      videoUrl: signedUrl,
      videoKey: key,
      videoModel: videoModel || "kling-3-standard",
      duration: result.durationSeconds,
    });
  } catch (err) {
    console.error(`Frame video generation failed for ${frameId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Video generation failed" },
      { status: 500 }
    );
  }
}
