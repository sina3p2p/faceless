import type { I2vRequest, ResolvedVideoModel, VideoResult } from "@/types/video-provider";
import { FalVideoProvider } from "./providers/fal";
import { ReplicateVideoProvider } from "./providers/replicate";

const fal = new FalVideoProvider();
const replicate = new ReplicateVideoProvider();

export async function dispatchI2v(
  req: I2vRequest,
  resolved: ResolvedVideoModel
): Promise<VideoResult> {
  if (resolved.provider === "replicate") {
    return replicate.generateFromImage(req, resolved);
  }
  return fal.generateFromImage(req, resolved);
}
