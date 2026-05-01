import type { WordTimestamp } from "@/types/tts";

export type QualityTier = "draft" | "standard" | "hero";

export type ColorGrade = "warm" | "cool" | "teal-orange" | "mono";

export interface ComposerScene {
  audioPath: string;
  mediaPath: string;
  mediaType: "video" | "image";
  text: string;
  duration: number;
  wordTimestamps: WordTimestamp[];
}

export interface ComposerOptions {
  scenes: ComposerScene[];
  captionStyle: string;
  backgroundMusicPath?: string;
  globalAudioPath?: string;
  outputFormat?: string;
  videoWidth?: number;
  videoHeight?: number;
  /** Quality tier — controls libx264 preset/crf trade-off. Defaults to "standard". */
  qualityTier?: QualityTier;
  /** Optional color grade. Applied as a 3D LUT if the matching file exists under public/luts/. */
  colorGrade?: ColorGrade;
}
