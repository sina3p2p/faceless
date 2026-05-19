import { StandaloneStrategy } from "./standalone";
import type { VideoType } from "../topology";

/**
 * Slim pipeline (see timelapsePipeline in ./pipelines): the timelapse-plan
 * worker replaces creative-brief → story → director → storyboard → motion.
 * There is no behavioral divergence left — the shape difference lives in the
 * pipeline definition — so this reuses the standalone voiceover + shared
 * audio/image/video/compose tail unchanged.
 */
export class TimelapseStrategy extends StandaloneStrategy {
  readonly videoType: VideoType = "timelapse";
}
