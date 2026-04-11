import { fal } from "@fal-ai/client";
import RunwayML from "@runwayml/sdk";
import * as fs from "fs/promises";
import { AI_VIDEO, VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "@/lib/constants";

fal.config({
  credentials: AI_VIDEO.falKey,
});

const T2V_MODEL = AI_VIDEO.t2vModel;

let _runwayClient: RunwayML | null = null;
function getRunwayClient(): RunwayML {
  if (!_runwayClient) {
    _runwayClient = new RunwayML({ apiKey: AI_VIDEO.runwayApiKey });
  }
  return _runwayClient;
}

function resolveModel(videoModelKey?: string) {
  const key = videoModelKey || DEFAULT_VIDEO_MODEL;
  const entry = VIDEO_MODELS.find((m) => m.id === key);
  return {
    modelId: entry?.modelId ?? AI_VIDEO.defaultI2vModel,
    provider: entry?.provider ?? ("fal" as const),
    durations: entry?.durations ?? [5, 10],
    endFrame: entry?.endFrame ?? false,
    durationFormat: entry?.durationFormat ?? ("string" as const),
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

const RUNWAY_RATIO_MAP: Record<string, string> = {
  "9:16": "720:1280",
  "16:9": "1280:720",
  "1:1": "960:960",
};

async function generateVideoViaRunway(
  imageUrl: string,
  prompt: string,
  apiDuration: number,
  modelId: string,
  aspectRatio: string = "9:16",
): Promise<VideoResult> {
  const client = getRunwayClient();
  const ratio = RUNWAY_RATIO_MAP[aspectRatio] || "768:1280";

  console.log(`[ai-video] runway.imageToVideo(${modelId}) duration=${apiDuration}s ratio=${ratio}`);

  type RunwayRatio = "1280:720" | "720:1280" | "1104:832" | "832:1104" | "960:960" | "1584:672";

  const task = await client.imageToVideo
    .create({
      model: modelId as "gen4_turbo" | "gen4.5",
      promptImage: imageUrl,
      promptText: prompt,
      ratio: ratio as RunwayRatio,
      duration: apiDuration,
    })
    .waitForTaskOutput();

  const videoUrl = task.output?.[0];
  if (!videoUrl) {
    throw new Error(`Runway ${modelId} returned no video URL`);
  }

  return { videoUrl, durationSeconds: apiDuration };
}

async function generateVideoViaFal(
  imageUrl: string,
  prompt: string,
  apiDuration: number,
  modelId: string,
  endFrame: boolean,
  endImageUrl?: string,
  durationFormat: "string" | "number" = "string",
): Promise<VideoResult> {
  const useEndImage = endFrame && !!endImageUrl;

  const input: Record<string, unknown> = {
    prompt,
    duration: durationFormat === "string" ? String(apiDuration) : apiDuration,
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
  } else if (modelId.includes("wan-") || modelId.includes("/wan/")) {
    input.image_url = imageUrl;
    if (useEndImage) input.end_image_url = endImageUrl;
  } else if (modelId.includes("grok-imagine")) {
    input.image_url = imageUrl;
    input.resolution = "720p";
  } else {
    input.image_url = imageUrl;
  }

  console.log(`[ai-video] fal.subscribe(${modelId}) api=${apiDuration}s input:`, JSON.stringify(input));

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

  return { videoUrl: data.video.url, durationSeconds: apiDuration };
}

export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  desiredDuration: number = 5,
  videoModelKey?: string,
  endImageUrl?: string,
  aspectRatio: string = "9:16",
): Promise<VideoResult> {
  const { modelId, provider, durations, endFrame, durationFormat } = resolveModel(videoModelKey);
  const apiDuration = pickBestDuration(desiredDuration, durations);

  if (provider === "runway") {
    return generateVideoViaRunway(imageUrl, prompt, apiDuration, modelId, aspectRatio);
  }

  return generateVideoViaFal(imageUrl, prompt, apiDuration, modelId, endFrame, endImageUrl, durationFormat);
}

export async function generateVideoFromText(
  prompt: string,
  duration: number = 5,
  aspectRatio: string = "9:16"
): Promise<VideoResult> {
  const apiDuration = [5, 10].includes(duration) ? duration : (duration > 7 ? 10 : 5);
  const result = await fal.subscribe(T2V_MODEL, {
    input: {
      prompt,
      duration: String(apiDuration) as "5" | "10",
      aspect_ratio: aspectRatio as "9:16" | "16:9" | "1:1",
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
  aspectRatio: string = "9:16",
): Promise<VideoResult> {
  const modelLabel = videoModelKey || DEFAULT_VIDEO_MODEL;
  console.log(`[ai-video] Trying image-to-video (${modelLabel}) desired=${desiredDuration}s${endImageUrl ? " with end frame" : ""} for: "${prompt.slice(0, 60)}..."`);
  return await generateVideoFromImage(imageUrl, prompt, desiredDuration, videoModelKey, endImageUrl, aspectRatio);
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

