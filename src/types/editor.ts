import type { WordTimestamp } from "@/types/tts";

export type { WordTimestamp };

export interface EditorScene {
  id: string;
  sceneOrder: number;
  text: string;
  duration: number;
  audioUrl: string;
  assetUrl: string;
  assetType: "video" | "image" | string;
  wordTimestamps: WordTimestamp[];
}
