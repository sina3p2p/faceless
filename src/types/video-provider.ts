import { AxiosInstance } from "axios";
import OpenAI from "openai";

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

export interface IImageRequest {
  model: TImageModelId;
  prompt: string;
  aspectRatio: TAspectRatio;
  n?: number;
  quality?: "low" | "medium" | "high" | null;
  referenceImages?: string[];
  /** When set, upload the first result to this exact storage key (handle-derived). */
  storageKey?: string;
}

export interface IProvider {
  readonly client: AxiosInstance | OpenAI;
  findModel(model: TVideoModelId): string | undefined;
  generateVideo(req: I2vRequest): Promise<VideoResult>;
  generateImage(req: IImageRequest): Promise<string[]>;
}