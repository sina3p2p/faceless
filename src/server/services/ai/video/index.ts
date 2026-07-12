import { pickBestDuration } from "./pick-duration";
import type { I2vRequest, VideoResult } from "@/types/video-provider";
import { VIDEO_MODELS } from "@/lib/constants";
import { KieVideoProvider, ReplicateVideoProvider } from "./providers";

export type { VideoResult } from "@/types/video-provider";

/**
 * Reference-mode generation for Seedance 2: pass character/location reference
 * images (and optionally a start frame and/or reference videos for continuity).
 */
export async function generateVideo(options: I2vRequest): Promise<VideoResult> {
  const kie = new KieVideoProvider();
  return kie.generateVideo(options);
}

/**
 * Video-to-video editing: sends the source video + edit prompt to Seedance 2
 * and returns the AI-edited result.
 */
export async function editVideo(
  videoUrl: string,
  prompt: string,
  duration: number,
  aspectRatio: TAspectRatio = "16:9",
  resolution: TVideoResolution = "480p",
  videoModelId: TVideoModelId = "seedance-2-pro"
): Promise<VideoResult> {
  const replicate = new ReplicateVideoProvider();
  const snapped = pickBestDuration(duration, VIDEO_MODELS[videoModelId]?.durations ?? []);
  return replicate.generateVideo(
    { videoUrl, prompt, duration: snapped, aspectRatio, resolution, model: videoModelId }
  );
}