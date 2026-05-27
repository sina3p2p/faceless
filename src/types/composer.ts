import type { WordTimestamp } from "@/types/tts";

export type QualityTier = "draft" | "standard" | "hero";

export type ColorGrade = "warm" | "cool" | "teal-orange" | "mono";

export interface ComposerScene {
  /** Path to an external audio file to mix into this scene. Omit for silent scenes. */
  audioPath?: string;
  mediaPath: string;
  mediaType: "video" | "image";
  text: string;
  duration: number;
  wordTimestamps: WordTimestamp[];
  /**
   * When true, the video clip already has dialogue audio baked in (e.g. Seedance
   * native lipsync). The composer preserves the video's audio stream instead of
   * mixing in an external file.
   */
  nativeAudio?: boolean;
}

/**
 * Sound-effect cue. `type` matches a file under `public/sfx/{type}.mp3`. The
 * cue plays for `durationS` starting at `atSeconds` from the start of the
 * final video. Missing asset files are skipped with a warning, so this is
 * safe to wire ahead of shipping the audio assets themselves.
 */
export interface SfxCue {
  type: string;
  atSeconds: number;
  durationS: number;
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
  /** Optional SFX cues mixed under the final audio track. Missing assets are skipped. */
  sfx?: SfxCue[];
}
