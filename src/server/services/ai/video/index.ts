import * as fs from "fs/promises";
import axios from "axios";
import { pickBestDuration } from "./pick-duration";
import type { VideoResult } from "@/types/video-provider";
import { VIDEO_MODELS } from "@/lib/constants";
import { ReplicateVideoProvider } from "./providers/replicate";

export type { VideoResult } from "@/types/video-provider";

const replicate = new ReplicateVideoProvider();

export async function generateVideoFromImage(
  startImageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelId: TVideoModelId,
  endImageUrl?: string,
  aspectRatio: TAspectRatio = "9:16"
): Promise<VideoResult> {
  const duration = pickBestDuration(desiredDuration, VIDEO_MODELS[videoModelId].durations);

  const req = {
    startImageUrl,
    endImageUrl,
    prompt,
    duration,
    aspectRatio,
  };

  return replicate.generateFromImage(req, videoModelId);
}

export async function downloadAIVideo(videoUrl: string, destPath: string): Promise<void> {
  const response = await axios.get<ArrayBuffer>(videoUrl, {
    responseType: "arraybuffer",
    timeout: 300_000,
  });
  await fs.writeFile(destPath, Buffer.from(response.data));
}
