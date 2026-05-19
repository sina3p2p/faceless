import { resolveVideoType, type VideoType } from "../topology";
import type { ContentStrategy } from "./types";
import { StandaloneStrategy } from "./standalone";
import { MusicStrategy } from "./music";
import { MovieStrategy } from "./movie";
import { TimelapseStrategy } from "./timelapse";

export type { ContentStrategy } from "./types";

const STRATEGIES: Record<VideoType, ContentStrategy> = {
  standalone: new StandaloneStrategy(),
  music_video: new MusicStrategy(),
  movie: new MovieStrategy(),
  timelapse: new TimelapseStrategy(),
};

/** Resolve the behavioral strategy for a project's (possibly raw text) videoType. */
export function getStrategy(rawVideoType: string | null | undefined): ContentStrategy {
  return STRATEGIES[resolveVideoType(rawVideoType)];
}
