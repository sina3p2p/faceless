import { pickBestDuration } from "./pick-duration";
import type { VideoResult } from "@/types/video-provider";
import { VIDEO_MODELS } from "@/lib/constants";
import { ReplicateVideoProvider } from "./providers/replicate";
import { KieVideoProvider } from "./providers/kie";

export type { VideoResult } from "@/types/video-provider";

export async function generateVideoFromImage(
  startImageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelId: TVideoModelId,
  endImageUrl?: string,
  aspectRatio: TAspectRatio = "9:16",
  resolution: TVideoResolution = "480p",
  generateAudio?: boolean
): Promise<VideoResult> {
  const replicate = new ReplicateVideoProvider();

  const duration = pickBestDuration(desiredDuration, VIDEO_MODELS[videoModelId]?.durations ?? []);

  const req = {
    startImageUrl,
    endImageUrl,
    prompt,
    duration,
    aspectRatio,
    resolution,
    generateAudio,
    model: videoModelId
  };

  return replicate.generateVideo(req);
}

/**
 * Reference-mode generation for Seedance 2: pass character/location reference
 * images (and optionally a start frame and/or reference videos for continuity).
 */
export async function generateVideoFromReferences(
  referenceImages: string[],
  referenceAudios: string[],
  prompt: string,
  videoModelId: TVideoModelId,
  aspectRatio: TAspectRatio = "9:16",
  resolution: TVideoResolution = "480p",
  duration: number = -1,
  opts?: {
    startImageUrl?: string;
    referenceVideos?: string[];
  }
): Promise<VideoResult> {
  const kie = new KieVideoProvider();
  return kie.generateVideo({
    model: videoModelId,
    referenceImages,
    referenceAudios,
    referenceVideos: opts?.referenceVideos,
    startImageUrl: opts?.startImageUrl,
    prompt,
    duration,
    aspectRatio,
    resolution,
    generateAudio: true,
  });
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