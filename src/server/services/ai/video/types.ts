export type VideoProviderId = "kling" | "google" | "runway" | "grok";

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
  modelId: string;
  provider: VideoProviderId;
  durations: readonly number[];
  endFrame: boolean;
  durationFormat: "string" | "number";
}

export interface IVideoProvider {
  generateFromImage(req: I2vRequest, modelId: string): Promise<VideoResult>;
}
