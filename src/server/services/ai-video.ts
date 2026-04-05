import { fal } from "@fal-ai/client";
import * as fs from "fs/promises";
import * as path from "path";

fal.config({
  credentials: process.env.FAL_KEY || "",
});

const I2V_MODEL = "fal-ai/kling-video/v2.1/standard/image-to-video";
const T2V_MODEL = "fal-ai/wan-25-preview/text-to-video";

interface VideoResult {
  videoUrl: string;
  durationSeconds: number;
}

export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  duration: "5" | "10" = "5"
): Promise<VideoResult> {
  const result = await fal.subscribe(I2V_MODEL, {
    input: {
      prompt,
      image_url: imageUrl,
      duration,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && update.logs) {
        for (const log of update.logs) {
          console.log(`[fal i2v] ${log.message}`);
        }
      }
    },
  });

  const data = result.data as { video?: { url: string } };
  if (!data?.video?.url) {
    throw new Error("fal.ai image-to-video returned no video URL");
  }

  return {
    videoUrl: data.video.url,
    durationSeconds: parseInt(duration),
  };
}

export async function generateVideoFromText(
  prompt: string,
  duration: "5" | "10" = "5"
): Promise<VideoResult> {
  const result = await fal.subscribe(T2V_MODEL, {
    input: {
      prompt,
      duration,
      aspect_ratio: "9:16" as const,
      resolution: "1080p" as const,
    },
    logs: true,
    onQueueUpdate: (update) => {
      if (update.status === "IN_PROGRESS" && update.logs) {
        for (const log of update.logs) {
          console.log(`[fal t2v] ${log.message}`);
        }
      }
    },
  });

  const data = result.data as { video?: { url: string } };
  if (!data?.video?.url) {
    throw new Error("fal.ai text-to-video returned no video URL");
  }

  return {
    videoUrl: data.video.url,
    durationSeconds: parseInt(duration),
  };
}

export async function getAIVideoForScene(
  imageUrl: string,
  prompt: string,
  duration: "5" | "10" = "5"
): Promise<VideoResult> {
  try {
    console.log(`[ai-video] Trying image-to-video for: "${prompt.slice(0, 60)}..."`);
    return await generateVideoFromImage(imageUrl, prompt, duration);
  } catch (err) {
    console.warn(
      `[ai-video] Image-to-video failed: ${err instanceof Error ? err.message : err}. Falling back to text-to-video.`
    );
    return await generateVideoFromText(prompt, duration);
  }
}

export async function downloadAIVideo(
  videoUrl: string,
  destPath: string
): Promise<void> {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download AI video: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destPath, buffer);
}

export async function uploadImageForFal(
  localPath: string
): Promise<string> {
  const buffer = await fs.readFile(localPath);
  const ext = path.extname(localPath).slice(1) || "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  const file = new File([buffer], `scene.${ext}`, { type: mimeType });
  const url = await fal.storage.upload(file);
  return url;
}
