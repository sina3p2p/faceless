import type { WordTimestamp } from "@/types/tts";

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
}
