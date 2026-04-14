import * as fs from "fs/promises";
import axios from "axios";
import { DEFAULT_VIDEO_MODEL } from "@/lib/constants";
import { dispatchI2v } from "./registry";
import { pickBestDuration } from "./pick-duration";
import { resolveModel } from "./resolve-model";
import type { VideoResult } from "./types";

export type { VideoResult } from "./types";

export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelKey?: string,
  endImageUrl?: string,
  aspectRatio: string = "9:16"
): Promise<VideoResult> {
  const resolved = resolveModel(videoModelKey);
  const apiDuration = pickBestDuration(desiredDuration, resolved.durations);

  const req = {
    imageUrl,
    prompt,
    apiDuration,
    endFrame: resolved.endFrame,
    endImageUrl,
    durationFormat: resolved.durationFormat,
    aspectRatio,
  };

  return dispatchI2v(req, resolved);
}

export async function getAIVideoForScene(
  imageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelKey?: string,
  endImageUrl?: string,
  aspectRatio: string = "9:16"
): Promise<VideoResult> {
  const modelLabel = videoModelKey || DEFAULT_VIDEO_MODEL;
  console.log(
    `[ai-video] Trying image-to-video (${modelLabel}) desired=${desiredDuration}s${endImageUrl ? " with end frame" : ""} for: "${prompt.slice(0, 60)}..."`
  );
  return await generateVideoFromImage(
    imageUrl,
    prompt,
    desiredDuration,
    videoModelKey,
    endImageUrl,
    aspectRatio
  );
}

export async function downloadAIVideo(videoUrl: string, destPath: string): Promise<void> {
  const response = await axios.get<ArrayBuffer>(videoUrl, {
    responseType: "arraybuffer",
    timeout: 300_000,
  });
  await fs.writeFile(destPath, Buffer.from(response.data));
}
