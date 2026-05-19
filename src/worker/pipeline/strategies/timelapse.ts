import { StandaloneStrategy } from "./standalone";
import type { VideoType } from "../topology";

/**
 * Slim pipeline: the timelapse-plan worker replaces creative-brief → story →
 * director → storyboard → motion. The only behavioral divergence is that
 * executive-produce must not generate a creative brief. The shared audio /
 * image / video / compose tail (and the standalone voiceover path) is reused.
 */
export class TimelapseStrategy extends StandaloneStrategy {
  readonly videoType: VideoType = "timelapse";

  skipsCreativeBrief(): boolean {
    return true;
  }
}
