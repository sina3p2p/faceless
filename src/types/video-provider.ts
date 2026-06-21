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

/**
 * Reference-mode request for Seedance 2.
 * Uses reference_images + reference_audios instead of first/last frame.
 * Mutually exclusive with I2vRequest's startImageUrl/endImageUrl.
 */
export interface ReferenceModeRequest {
  /** Character/scene reference images (up to 9). Referenced in prompt as [Image1], etc. */
  referenceImages: string[];
  /** Audio files for lipsync (up to 3, total ≤15s). Referenced in prompt as [Audio1], etc. */
  referenceAudios?: string[];
  prompt: string;
  /** Use -1 to let the model choose duration based on audio length. */
  duration: number;
  aspectRatio: TAspectRatio;
  resolution: TVideoResolution;
}

export interface VideoEditRequest {
  /** URL of the source video to edit. */
  videoUrl: string;
  prompt: string;
  duration: number;
  aspectRatio: TAspectRatio;
  resolution: TVideoResolution;
}

export interface IVideoProvider {
  readonly client: AxiosInstance;
  generateFromImage(req: I2vRequest, model: TVideoModelId): Promise<VideoResult>;
}
