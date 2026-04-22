import { DEFAULT_VIDEO_MODEL, VIDEO_I2V_PROVIDER, VIDEO_MODELS } from "@/lib/constants";
import type { ResolvedVideoModel } from "@/types/video-provider";

export function resolveModel(videoModelKey?: string): ResolvedVideoModel {
  const key = videoModelKey || DEFAULT_VIDEO_MODEL;
  const entry =
    VIDEO_MODELS.find((m) => m.id === key) ??
    VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!;

  const provider = VIDEO_I2V_PROVIDER;
  if (provider === "replicate" && !entry.replicateModel) {
    throw new Error(
      "This video model is not on Replicate. Pick Seedance 2 Pro/Fast, or set VIDEO_I2V_PROVIDER to fal in src/lib/constants.ts (or env VIDEO_I2V_PROVIDER=fal)."
    );
  }

  return {
    modelId: entry.id,
    provider,
    falEndpoint: entry.falEndpoint,
    replicateModel: entry.replicateModel,
    resolution: entry.supportedResolution[0],
    generateAudio: entry.generateAudio,
    durations: entry.durations,
    endFrame: entry.endFrame,
  };
}
