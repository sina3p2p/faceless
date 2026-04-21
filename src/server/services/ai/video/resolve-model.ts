import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from "@/lib/constants";
import type { ResolvedVideoModel } from "@/types/video-provider";

export function resolveModel(videoModelKey?: string): ResolvedVideoModel {
  const key = videoModelKey || DEFAULT_VIDEO_MODEL;
  const entry =
    VIDEO_MODELS.find((m) => m.id === key) ??
    VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!;

  return {
    falEndpoint: entry.falEndpoint,
    falProfile: entry.falProfile,
    falLumaResolution: entry.falLumaResolution,
    falVeoResolution: entry.falVeoResolution,
    falKlingGenerateAudio: entry.falKlingGenerateAudio,
    falSeedanceResolution: entry.falSeedanceResolution,
    falSeedanceGenerateAudio: entry.falSeedanceGenerateAudio,
    durations: entry.durations,
    endFrame: entry.endFrame,
    durationFormat: entry.durationFormat,
  };
}
