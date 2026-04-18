import type { VideoScript } from "@/types/narration-schemas";

/** Character image ref used when generating scene media (URL + description). */
export interface CharacterRef {
  url: string;
  description: string;
}

/** Story asset row from DB / JSON; URLs may be storage keys until resolved in the worker. */
export interface StoryAssetInput {
  id: string;
  type: "character" | "location" | "prop";
  name: string;
  description: string;
  url: string;
  /** Optional character sheet image key or URL. */
  sheetUrl?: string;
}

/** Resolved row (same fields; URLs are typically signed HTTPS). */
export type StoryAssetRef = StoryAssetInput;

export type PreApproved = Map<number, { path: string; type: "video" | "image"; url: string }>;

export type ScriptInput = Pick<VideoScript, "scenes">;
