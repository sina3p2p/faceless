import type { I2vRequest, ResolvedVideoModel, VideoResult } from "@/types/video-provider";
import { FalVideoProvider } from "./providers/fal";

const fal = new FalVideoProvider();

export async function dispatchI2v(
  req: I2vRequest,
  resolved: ResolvedVideoModel
): Promise<VideoResult> {
  return fal.generateFromImage(req, resolved);
}
