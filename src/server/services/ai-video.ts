import { fal } from "@fal-ai/client";
import * as fs from "fs/promises";
import { AI_VIDEO, VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "@/lib/constants";

fal.config({
  credentials: AI_VIDEO.falKey,
});

const T2V_MODEL = AI_VIDEO.t2vModel;

function resolveModel(videoModelKey?: string) {
  const key = videoModelKey || DEFAULT_VIDEO_MODEL;
  const entry = VIDEO_MODELS.find((m) => m.id === key);
  return {
    modelId: entry?.modelId ?? AI_VIDEO.defaultI2vModel,
    durations: entry?.durations ?? [5, 10],
    endFrame: entry?.endFrame ?? false,
  };
}

/**
 * Pick the best API duration for the requested scene duration.
 * If the model supports the exact value, use it.
 * Otherwise pick the closest supported value that is >= requested (so the
 * composer can trim rather than stretch). Falls back to the largest available.
 */
function pickBestDuration(requested: number, supported: readonly number[]): number {
  if (supported.includes(requested)) return requested;
  const candidates = supported.filter((d) => d >= requested);
  if (candidates.length > 0) return Math.min(...candidates);
  return Math.max(...supported);
}

interface VideoResult {
  videoUrl: string;
  durationSeconds: number;
}

export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelKey?: string,
  endImageUrl?: string,
): Promise<VideoResult> {
  const { modelId, durations, endFrame } = resolveModel(videoModelKey);
  const apiDuration = pickBestDuration(desiredDuration, durations);
  const useEndImage = endFrame && !!endImageUrl;

  const input: Record<string, unknown> = {
    prompt,
    duration: String(apiDuration),
  };

  if (modelId.includes("kling-video/v3") || modelId.includes("kling-video/o3")) {
    input.start_image_url = imageUrl;
    if (useEndImage) input.end_image_url = endImageUrl;
    input.generate_audio = false;
  } else if (modelId.includes("kling-video")) {
    input.image_url = imageUrl;
    if (useEndImage) input.tail_image_url = endImageUrl;
  } else if (modelId.includes("hailuo") || modelId.includes("minimax")) {
    input.image_url = imageUrl;
    if (useEndImage) input.end_image_url = endImageUrl;
  } else if (modelId.includes("wan-")) {
    input.image_url = imageUrl;
    if (useEndImage) input.end_image_url = endImageUrl;
  } else {
    input.image_url = imageUrl;
  }

  console.log(`[ai-video] fal.subscribe(${modelId}) desired=${desiredDuration}s api=${apiDuration}s input:`, JSON.stringify(input));

  const result = await fal.subscribe(modelId, {
    input,
    logs: true,
    onQueueUpdate: (update: { status: string; logs?: Array<{ message: string }> }) => {
      if (update.status === "IN_PROGRESS" && update.logs) {
        for (const log of update.logs) {
          console.log(`[fal i2v] ${log.message}`);
        }
      }
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const data = result.data as { video?: { url: string } };
  if (!data?.video?.url) {
    throw new Error(`fal.ai image-to-video (${modelId}) returned no video URL`);
  }

  return {
    videoUrl: data.video.url,
    durationSeconds: apiDuration,
  };
}

export async function generateVideoFromText(
  prompt: string,
  duration: number = 5
): Promise<VideoResult> {
  const apiDuration = [5, 10].includes(duration) ? duration : (duration > 7 ? 10 : 5);
  const result = await fal.subscribe(T2V_MODEL, {
    input: {
      prompt,
      duration: String(apiDuration) as "5" | "10",
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
    durationSeconds: apiDuration,
  };
}

export async function getAIVideoForScene(
  imageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelKey?: string,
  endImageUrl?: string,
): Promise<VideoResult> {
  const modelLabel = videoModelKey || DEFAULT_VIDEO_MODEL;
  console.log(`[ai-video] Trying image-to-video (${modelLabel}) desired=${desiredDuration}s${endImageUrl ? " with end frame" : ""} for: "${prompt.slice(0, 60)}..."`);
  return await generateVideoFromImage(imageUrl, prompt, desiredDuration, videoModelKey, endImageUrl);
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

