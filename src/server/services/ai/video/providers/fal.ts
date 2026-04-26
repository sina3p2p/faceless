import { fal } from "@fal-ai/client";
import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, ResolvedVideoModel, VideoResult } from "@/types/video-provider";

type FalResponse = {
  video?: {
    url?: string;
  };
} | undefined;

function mapAspectKling(ar: string): "16:9" | "9:16" | "1:1" {
  if (ar === "16:9") return "16:9";
  if (ar === "1:1") return "1:1";
  return "9:16";
}

function mapAspectLuma(ar: string): "16:9" | "9:16" | "4:3" | "3:4" | "21:9" | "9:21" {
  if (ar === "16:9") return "16:9";
  if (ar === "1:1") return "9:16";
  return "9:16";
}

function mapAspectVeo(ar: string): "16:9" | "9:16" | "auto" {
  if (ar === "16:9") return "16:9";
  if (ar === "9:16") return "9:16";
  if (ar === "1:1") return "9:16";
  return "auto";
}

function mapAspectGrok(ar: string): "16:9" | "9:16" | "1:1" | "auto" | "4:3" | "3:2" | "2:3" | "3:4" {
  if (ar === "16:9") return "16:9";
  if (ar === "9:16") return "9:16";
  if (ar === "1:1") return "1:1";
  return "auto";
}

function mapAspectSeedance(ar: string): "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" {
  if (ar === "21:9" || ar === "16:9" || ar === "4:3" || ar === "1:1" || ar === "3:4" || ar === "9:16") {
    return ar;
  }
  return "auto";
}

function extractVideoUrl(data: FalResponse): string {
  if (!data || typeof data !== "object") {
    throw new Error("Fal returned empty video payload");
  }
  const url = data.video?.url;
  if (!url) {
    throw new Error("Fal response missing video.url");
  }
  return url;
}

function readDurationSeconds(data: unknown, fallback: number): number {
  if (!data || typeof data !== "object") return fallback;
  const video = (data as Record<string, unknown>).video;
  if (video && typeof video === "object" && video !== null) {
    const d = (video as Record<string, unknown>).duration;
    if (typeof d === "number" && Number.isFinite(d)) return d;
  }
  return fallback;
}

function buildInput(req: I2vRequest, resolved: ResolvedVideoModel): Record<string, unknown> {
  const {
    falEndpoint,
    resolution,
    generateAudio,
  } = resolved;

  const useEnd = req.endFrame && !!req.endImageUrl;
  const res = resolution ?? "1080p";

  switch (falEndpoint) {
    case "fal-ai/kling-video/v3/standard/image-to-video": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: String(req.apiDuration),
        aspect_ratio: mapAspectKling(req.aspectRatio),
      };
      if (useEnd && req.endImageUrl) input.tail_image_url = req.endImageUrl;
      return input;
    }
    case "fal-ai/kling-video/v3/pro/image-to-video": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        start_image_url: req.imageUrl,
        duration: String(req.apiDuration),
        generate_audio: generateAudio ?? false,
      };
      if (useEnd && req.endImageUrl) input.end_image_url = req.endImageUrl;
      return input;
    }
    case "fal-ai/luma-dream-machine/ray-2/image-to-video": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: req.imageUrl,
        aspect_ratio: mapAspectLuma(req.aspectRatio),
        resolution: res,
        duration: req.apiDuration >= 9 ? "9s" : "5s",
      };
      if (useEnd && req.endImageUrl) input.end_image_url = req.endImageUrl;
      return input;
    }
    case "fal-ai/luma-dream-machine/ray-2-flash/image-to-video": {
      const map: Record<number, string> = { 4: "4s", 6: "6s", 8: "8s" };
      const duration = map[req.apiDuration] ?? "8s";
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        aspect_ratio: mapAspectVeo(req.aspectRatio),
        duration,
        resolution: res,
        generate_audio: false,
      };
    }
    case "fal-ai/veo3.1/image-to-video":
    case "fal-ai/veo3.1/fast/image-to-video": {
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        aspect_ratio: mapAspectVeo(req.aspectRatio),
        duration: req.apiDuration,
        resolution: res,
      };
    }
    case "xai/grok-imagine-video/image-to-video":
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: req.apiDuration,
        aspect_ratio: mapAspectGrok(req.aspectRatio),
        resolution,
      };
    case "bytedance/seedance-2.0/image-to-video":
    case "bytedance/seedance-2.0/fast/image-to-video": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: req.apiDuration,
        aspect_ratio: mapAspectSeedance(req.aspectRatio),
        resolution: res,
        generate_audio: generateAudio ?? false,
      };
      if (useEnd && req.endImageUrl) input.end_image_url = req.endImageUrl;
      return input;
    }
    default: {
      throw new Error(`Unsupported Fal endpoint: ${falEndpoint}`);
    }
  }
}

export class FalVideoProvider implements IVideoProvider {
  async generateFromImage(req: I2vRequest, resolved: ResolvedVideoModel): Promise<VideoResult> {
    const key = AI_VIDEO.falKey;
    if (!key) {
      throw new Error("FAL_KEY is not set (required for video generation)");
    }
    fal.config({ credentials: key });

    const input = buildInput(req, resolved);
    const endpoint = resolved.falEndpoint;

    const result = await fal.subscribe(endpoint, {
      input,
      logs: true,
    });

    const videoUrl = extractVideoUrl(result.data);
    const durationSeconds = readDurationSeconds(result.data, req.apiDuration);
    return { videoUrl, durationSeconds };
  }
}
