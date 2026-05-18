import * as fs from "fs/promises";
import axios from "axios";
import { pickBestDuration } from "./pick-duration";
import type { TVideoResolution, VideoResult } from "@/types/video-provider";
import { VIDEO_MODELS } from "@/lib/constants";
import { ReplicateVideoProvider } from "./providers/replicate";

export type { VideoResult } from "@/types/video-provider";

export async function generateVideoFromImage(
  startImageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelId: TVideoModelId,
  endImageUrl?: string,
  aspectRatio: TAspectRatio = "9:16",
  resolution: TVideoResolution = "480p"
): Promise<VideoResult> {
  const replicate = new ReplicateVideoProvider();

  const duration = pickBestDuration(desiredDuration, VIDEO_MODELS[videoModelId].durations);

  const req = {
    startImageUrl,
    endImageUrl,
    prompt,
    duration,
    aspectRatio,
    resolution,
  };

  return replicate.generateFromImage(req, videoModelId);
}

/** Lip-sync a generated clip to a voice track (Replicate; movie type only). */
export async function lipSyncClip(
  videoUrl: string,
  audioUrl: string
): Promise<VideoResult> {
  const replicate = new ReplicateVideoProvider();
  return replicate.lipSync(videoUrl, audioUrl);
}

export async function downloadAIVideo(videoUrl: string, destPath: string): Promise<void> {
  const response = await axios.get<ArrayBuffer>(videoUrl, {
    responseType: "arraybuffer",
    timeout: 300_000,
  });
  await fs.writeFile(destPath, Buffer.from(response.data));
}
