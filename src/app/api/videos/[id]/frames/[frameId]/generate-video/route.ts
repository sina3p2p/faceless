import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoProjects, sceneFrames, media } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { generateVideoFromImage } from "@/server/services/ai/video";
import { SEEDANCE2_MODELS, isE005, addSeedanceNoise, addSeedanceNoiseEnhanced } from "@/server/services/ai/video/seedance-noise";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { z } from "zod";
import { VIDEO_MODEL_IDS } from "@/lib/constants";

const bodySchema = z.object({
  visualDescription: z.string().optional(),
  videoModel: z.enum(VIDEO_MODEL_IDS).optional(),
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

  if (!video || video.userId !== user.id) return notFound("Video not found");

  const frame = await db.query.sceneFrames.findFirst({
    where: eq(sceneFrames.id, frameId),
    with: { imageMedia: true },
  });

  if (!frame) return notFound("Frame not found");

  if (!frame.imageMedia) {
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
  const videoModel = parsed.data.videoModel || video.modelSettings.videoModel;
  const prompt = motionPrompt;

  try {
    const imageUrl = mediaUrl(frame.imageMedia.url);
    let startUrl = imageUrl;
    if (SEEDANCE2_MODELS.has(videoModel)) {
      try { startUrl = await addSeedanceNoise(imageUrl, frameId, videoId); } catch { startUrl = imageUrl; }
    }

    const callGenerate = (url: string) =>
      generateVideoFromImage(url, prompt, duration, videoModel, undefined, video.videoSize, video.videoResolution);

    const result = await callGenerate(startUrl).catch(async (err) => {
      if (SEEDANCE2_MODELS.has(videoModel) && isE005(err)) {
        console.warn(`Frame ${frameId}: E005 on attempt 1 — retrying with enhanced perturbation`);
        let enhUrl = imageUrl;
        try { enhUrl = await addSeedanceNoiseEnhanced(imageUrl, frameId, videoId); } catch { /* keep original */ }
        return callGenerate(enhUrl);
      }
      throw err;
    });

    const videoResponse = await fetch(result.videoUrl);
    if (!videoResponse.ok) throw new Error("Failed to download generated video");
    const buffer = Buffer.from(await videoResponse.arrayBuffer());

    const key = `frames/${videoId}/video_${frameId}_${Date.now()}.mp4`;
    await uploadFile(key, buffer, "video/mp4");

    const [newMedia] = await db.insert(media).values({
      userId: user.id,
      frameId,
      type: "video",
      url: key,
      prompt,
      modelUsed: videoModel,
      metadata: { duration: result.durationSeconds },
    }).returning();

    await db
      .update(sceneFrames)
      .set({ videoMediaId: newMedia.id })
      .where(eq(sceneFrames.id, frameId));

    return NextResponse.json({
      videoUrl: mediaUrl(key),
      videoKey: key,
      videoModel: videoModel,
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
