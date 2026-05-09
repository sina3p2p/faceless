import { AxiosInstance } from "axios";

/** User-selectable i2v backend. Fal = fal.ai. Replicate = same catalog entries where `replicateModel` is set (Seedance, etc.). */
export type TVideoProviderId = "fal" | "replicate";

export type TVideoModelEndpoint =
  | "bytedance/seedance-2.0"
  | "kwaivgi/kling-v2.5-turbo-pro"
  | "kwaivgi/kling-v2.6"
  | "bytedance/seedance-2.0/image-to-video"
  | "bytedance/seedance-2.0/fast/image-to-video"
  | "fal-ai/luma-dream-machine/ray-2/image-to-video"
  | "fal-ai/luma-dream-machine/ray-2-flash/image-to-video"
  | "xai/grok-imagine-video/image-to-video"
  | "fal-ai/veo3.1/image-to-video"
  | "fal-ai/veo3.1/fast/image-to-video"
  | "fal-ai/kling-video/v3/standard/image-to-video"
  | "fal-ai/kling-video/v3/pro/image-to-video"
  | "fal-ai/kling-video/v2.6/pro/image-to-video"
  | "pixverse/pixverse-v6";

export interface VideoResult {
  videoUrl: string;
  durationSeconds: number;
}

export interface I2vRequest {
  startImageUrl: string;
  endImageUrl?: string;
  prompt: string;
  duration: number;
  aspectRatio: TAspectRatio;
}

export type TVideoModel = {
  id: TVideoModelId;
  label: string;
  description: string;
  provider: TVideoProviderId;
  endpoint?: TVideoModelEndpoint;
  durations: number[];
  supportedResolution: ("360p" | "480p" | "540p" | "720p" | "1080p" | "4k")[];
  endFrameSupported: boolean;
};

export interface IVideoProvider {
  readonly client: AxiosInstance;
  generateFromImage(req: I2vRequest, model: TVideoModelId): Promise<VideoResult>;
}
