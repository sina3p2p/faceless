export type FalVideoProfile =
  | "kling_v21"
  | "kling_v21_master"
  | "kling_v16_tail"
  | "kling_v26"
  | "luma_ray2"
  | "veo31"
  | "grok_imagine"
  | "seedance2"
  | "seedance2_fast";

export interface VideoResult {
  videoUrl: string;
  durationSeconds: number;
}

export interface I2vRequest {
  imageUrl: string;
  prompt: string;
  apiDuration: number;
  endFrame: boolean;
  endImageUrl?: string;
  durationFormat: "string" | "number";
  aspectRatio: string;
}

export interface ResolvedVideoModel {
  falEndpoint: string;
  falProfile: FalVideoProfile;
  falLumaResolution?: "540p" | "720p" | "1080p";
  falVeoResolution?: "720p" | "1080p" | "4k";
  /** Kling v2.6 on Fal only — O3 enables native audio. */
  falKlingGenerateAudio?: boolean;
  /** ByteDance Seedance 2.0 / 2.0 Fast on Fal (`bytedance/seedance-2.0/...`). */
  falSeedanceResolution?: "480p" | "720p" | "1080p";
  falSeedanceGenerateAudio?: boolean;
  durations: readonly number[];
  endFrame: boolean;
  durationFormat: "string" | "number";
}

export interface IVideoProvider {
  generateFromImage(req: I2vRequest, resolved: ResolvedVideoModel): Promise<VideoResult>;
}
