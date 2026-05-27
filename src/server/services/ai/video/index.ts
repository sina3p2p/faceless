import * as fs from "fs/promises";
import axios from "axios";
import { pickBestDuration } from "./pick-duration";
import type { VideoResult } from "@/types/video-provider";
import { VIDEO_MODELS } from "@/lib/constants";
import { ReplicateVideoProvider } from "./providers/replicate";

export type { VideoResult } from "@/types/video-provider";

export async function generateVideoFromImage(
  startImageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelId: TVideoModelId,
  correctionAgentModelId: string,
  endImageUrl?: string,
  aspectRatio: TAspectRatio = "9:16",
  resolution: TVideoResolution = "480p",
  generateAudio?: boolean
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
    generateAudio,
  };

  return replicate.generateFromImage(req, videoModelId);
}

/**
 * Reference-mode generation for Seedance 2: pass a character reference image and
 * the scene's TTS audio file so the model drives lipsync natively.
 * No start/last frame — mutually exclusive with generateVideoFromImage.
 */
export async function generateVideoFromReferences(
  referenceImages: string[],
  referenceAudios: string[],
  prompt: string,
  videoModelId: TVideoModelId,
  aspectRatio: TAspectRatio = "9:16",
  resolution: TVideoResolution = "480p",
  duration: number = -1
): Promise<VideoResult> {
  const replicate = new ReplicateVideoProvider();
  return replicate.generateFromReferences(
    { referenceImages, referenceAudios, prompt, duration, aspectRatio, resolution },
    videoModelId
  );
}

export async function downloadAIVideo(videoUrl: string, destPath: string): Promise<void> {
  const response = await axios.get<ArrayBuffer>(videoUrl, {
    responseType: "arraybuffer",
    timeout: 300_000,
  });
  await fs.writeFile(destPath, Buffer.from(response.data));
}
