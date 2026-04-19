import type { I2vRequest, IVideoProvider, ResolvedVideoModel, VideoProviderId, VideoResult } from "@/types/video-provider";
import { GoogleVideoProvider } from "./providers/google";
import { BytePlusVideoProvider } from "./providers/byteplus";
import { GrokVideoProvider } from "./providers/grok";
import { KlingVideoProvider } from "./providers/kling";
import { RunwayVideoProvider } from "./providers/runway";

const providers: Record<VideoProviderId, IVideoProvider> = {
  runway: new RunwayVideoProvider(),
  kling: new KlingVideoProvider(),
  google: new GoogleVideoProvider(),
  grok: new GrokVideoProvider(),
  byteplus: new BytePlusVideoProvider(),
};

export async function dispatchI2v(
  req: I2vRequest,
  resolved: ResolvedVideoModel
): Promise<VideoResult> {
  return providers[resolved.provider].generateFromImage(req, resolved.modelId);
}
