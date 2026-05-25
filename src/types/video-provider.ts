import { AxiosInstance } from "axios";

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
  resolution: TVideoResolution;
  /** Generate audio in the video clip (ambient or speech, model-dependent). */
  generateAudio?: boolean;
}

export interface IVideoProvider {
  readonly client: AxiosInstance;
  generateFromImage(req: I2vRequest, model: TVideoModelId): Promise<VideoResult>;
}
