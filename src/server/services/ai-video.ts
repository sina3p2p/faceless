import { fal } from "@fal-ai/client";
import * as fs from "fs/promises";
import * as path from "path";
import { AI_VIDEO, VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "@/lib/constants";

fal.config({
  credentials: AI_VIDEO.falKey,
});

const T2V_MODEL = AI_VIDEO.t2vModel;

function resolveI2VModelId(videoModelKey?: string): string {
  const key = videoModelKey || DEFAULT_VIDEO_MODEL;
  const entry = VIDEO_MODELS.find((m) => m.id === key);
  return entry?.modelId ?? AI_VIDEO.defaultI2vModel;
}

interface VideoResult {
  videoUrl: string;
  durationSeconds: number;
}

export interface CharacterRef {
  url: string;
  description: string;
}

export async function generateVideoFromImage(
  imageUrl: string,
  prompt: string,
  duration: "5" | "10" = "5",
  videoModelKey?: string,
  endImageUrl?: string,
  characterRefs?: CharacterRef[]
): Promise<VideoResult> {
  const modelId = resolveI2VModelId(videoModelKey);

  const input: Record<string, unknown> = {
    prompt,
    duration,
  };

  if (modelId.includes("kling-video/v3") || modelId.includes("kling-video/o3")) {
    input.start_image_url = imageUrl;
    if (endImageUrl) input.end_image_url = endImageUrl;
    input.generate_audio = false;

    if (characterRefs && characterRefs.length > 0) {
      input.elements = characterRefs.map((c) => ({
        frontal_image_url: c.url,
      }));
      const elementTags = characterRefs.map((c, i) => {
        const label = c.description || `character ${i + 1}`;
        return `@Element${i + 1} (${label})`;
      }).join(", ");
      input.prompt = `${prompt}. Featuring: ${elementTags}`;
    }
  } else if (modelId.includes("kling-video")) {
    input.image_url = imageUrl;
    if (endImageUrl) input.tail_image_url = endImageUrl;
  } else {
    input.image_url = imageUrl;
  }

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
  duration: "5" | "10" = "5",
  videoModelKey?: string,
  endImageUrl?: string,
  characterRefs?: CharacterRef[]
): Promise<VideoResult> {
  const modelLabel = videoModelKey || DEFAULT_VIDEO_MODEL;
  const charCount = characterRefs?.length || 0;
  console.log(`[ai-video] Trying image-to-video (${modelLabel})${endImageUrl ? " with end frame" : ""}${charCount ? ` with ${charCount} character ref(s)` : ""} for: "${prompt.slice(0, 60)}..."`);
  return await generateVideoFromImage(imageUrl, prompt, duration, videoModelKey, endImageUrl, characterRefs);
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
