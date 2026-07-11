import { AxiosInstance } from "axios";

export interface VideoResult {
  videoUrl: string;
  durationSeconds: number;
}

export interface I2vRequest {
  model: TVideoModelId;
  prompt: string;
  duration: number;
  aspectRatio: TAspectRatio;
  resolution: TVideoResolution;
  startImageUrl?: string;
  endImageUrl?: string;
  videoUrl?: string;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
  /** Generate audio in the video clip (ambient or speech, model-dependent). */
  generateAudio?: boolean;
}

export interface IProvider {
  readonly client: AxiosInstance;
  findModel(model: TVideoModelId): string | undefined;
  generateVideo(req: I2vRequest): Promise<VideoResult>;
}