/** User-selectable i2v backend. Fal = fal.ai. Replicate = same catalog entries where `replicateModel` is set (Seedance, etc.). */
export type TVideoProviderId = "fal" | "replicate";

export type TVideoModelEndpoint =
  | "bytedance/seedance-2.0/image-to-video"
  | "bytedance/seedance-2.0/fast/image-to-video"
  | "fal-ai/luma-dream-machine/ray-2/image-to-video"
  | "fal-ai/luma-dream-machine/ray-2-flash/image-to-video"
  | "xai/grok-imagine-video/image-to-video"
  | "fal-ai/veo3.1/image-to-video"
  | "fal-ai/veo3.1/fast/image-to-video"
  | "fal-ai/kling-video/v3/standard/image-to-video"
  | "fal-ai/kling-video/v3/pro/image-to-video"
  | "fal-ai/kling-video/v2.6/pro/image-to-video";

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
  aspectRatio: string;
}

export type TVideoModelEntry = {
  id: string;
  label: string;
  description: string;
  falEndpoint: TVideoModelEndpoint;
  /** When set, this model can be run on Replicate using this `owner/model` id (https://replicate.com). */
  replicateModel?: `${string}/${string}`;
  durations: readonly number[];
  endFrame: boolean;
  generateAudio?: boolean;
  supportedResolution: readonly ("480p" | "540p" | "720p" | "1080p" | "4k")[];
};

export interface ResolvedVideoModel {
  modelId: string;
  provider: TVideoProviderId;
  falEndpoint: TVideoModelEntry['falEndpoint'];
  replicateModel?: TVideoModelEntry['replicateModel'];
  resolution: TVideoModelEntry['supportedResolution'][number] | undefined;
  generateAudio: TVideoModelEntry['generateAudio'];
  durations: TVideoModelEntry['durations'];
  endFrame: boolean;
}

export interface IVideoProvider {
  generateFromImage(req: I2vRequest, resolved: ResolvedVideoModel): Promise<VideoResult>;
}
