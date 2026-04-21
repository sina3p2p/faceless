import { fal } from "@fal-ai/client";
import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, ResolvedVideoModel, VideoResult } from "@/types/video-provider";

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

function extractVideoUrl(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Fal returned empty video payload");
  }
  const rec = data as Record<string, unknown>;
  const video = rec.video;
  if (video && typeof video === "object" && video !== null) {
    const url = (video as Record<string, unknown>).url;
    if (typeof url === "string" && url.length > 0) return url;
  }
  throw new Error("Fal response missing video.url");
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
    falProfile,
    falLumaResolution,
    falVeoResolution,
    falKlingGenerateAudio,
    falSeedanceResolution,
    falSeedanceGenerateAudio,
  } = resolved;
  const useEnd = req.endFrame && !!req.endImageUrl;

  switch (falProfile) {
    case "kling_v21":
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: String(req.apiDuration),
      };
    case "kling_v21_master":
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: String(req.apiDuration),
      };
    case "kling_v16_tail": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: String(req.apiDuration),
        aspect_ratio: mapAspectKling(req.aspectRatio),
      };
      if (useEnd && req.endImageUrl) input.tail_image_url = req.endImageUrl;
      return input;
    }
    case "kling_v26": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        start_image_url: req.imageUrl,
        duration: String(req.apiDuration),
        generate_audio: falKlingGenerateAudio ?? false,
      };
      if (useEnd && req.endImageUrl) input.end_image_url = req.endImageUrl;
      return input;
    }
    case "luma_ray2": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: req.imageUrl,
        aspect_ratio: mapAspectLuma(req.aspectRatio),
        resolution: falLumaResolution ?? "720p",
        duration: req.apiDuration >= 9 ? "9s" : "5s",
      };
      if (useEnd && req.endImageUrl) input.end_image_url = req.endImageUrl;
      return input;
    }
    case "veo31": {
      const map: Record<number, string> = { 4: "4s", 6: "6s", 8: "8s" };
      const duration = map[req.apiDuration] ?? "8s";
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        aspect_ratio: mapAspectVeo(req.aspectRatio),
        duration,
        resolution: falVeoResolution ?? "720p",
        generate_audio: false,
      };
    }
    case "grok_imagine":
      return {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: req.apiDuration,
        aspect_ratio: mapAspectGrok(req.aspectRatio),
        resolution: "720p",
      };
    case "seedance2":
    case "seedance2_fast": {
      const input: Record<string, unknown> = {
        prompt: req.prompt,
        image_url: req.imageUrl,
        duration: req.apiDuration,
        aspect_ratio: mapAspectSeedance(req.aspectRatio),
        resolution: falSeedanceResolution ?? "720p",
        generate_audio: falSeedanceGenerateAudio ?? false,
      };
      if (useEnd && req.endImageUrl) input.end_image_url = req.endImageUrl;
      return input;
    }
    default: {
      const _exhaustive: never = falProfile;
      return _exhaustive;
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

    console.log(
      `[ai-video] fal.subscribe(${endpoint}) duration=${req.apiDuration}s profile=${resolved.falProfile}`
    );

    const result = await fal.subscribe(endpoint, {
      input,
      logs: true,
    });

    const videoUrl = extractVideoUrl(result.data);
    const durationSeconds = readDurationSeconds(result.data, req.apiDuration);
    return { videoUrl, durationSeconds };
  }
}
