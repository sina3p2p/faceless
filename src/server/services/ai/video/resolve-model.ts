import { DEFAULT_VIDEO_MODEL, VIDEO_MODELS } from "@/lib/constants";
import type { ResolvedVideoModel, VideoProviderId } from "@/types/video-provider";

export function resolveModel(videoModelKey?: string): ResolvedVideoModel {
  const key = videoModelKey || DEFAULT_VIDEO_MODEL;
  const entry =
    VIDEO_MODELS.find((m) => m.id === key) ??
    VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!;

  return {
    modelId: entry.modelId,
    provider: entry.provider as VideoProviderId,
    durations: entry.durations,
    endFrame: entry.endFrame,
    durationFormat: entry.durationFormat,
  };
}
