import RunwayML from "@runwayml/sdk";
import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "../types";

const RUNWAY_RATIO_MAP: Record<string, string> = {
  "9:16": "720:1280",
  "16:9": "1280:720",
  "1:1": "960:960",
};

export class RunwayVideoProvider implements IVideoProvider {
  private client: RunwayML | null = null;

  private getClient(): RunwayML {
    if (!this.client) {
      this.client = new RunwayML({ apiKey: AI_VIDEO.runwayApiKey });
    }
    return this.client;
  }

  async generateFromImage(req: I2vRequest, modelId: string): Promise<VideoResult> {
    const client = this.getClient();
    const ratio = RUNWAY_RATIO_MAP[req.aspectRatio] || "720:1280";

    console.log(`[ai-video] runway.imageToVideo(${modelId}) duration=${req.apiDuration}s ratio=${ratio}`);

    type RunwayRatio = "1280:720" | "720:1280" | "1104:832" | "832:1104" | "960:960" | "1584:672";

    const task = await client.imageToVideo
      .create({
        model: modelId as "gen4_turbo" | "gen4.5",
        promptImage: req.imageUrl,
        promptText: req.prompt,
        ratio: ratio as RunwayRatio,
        duration: req.apiDuration,
      })
      .waitForTaskOutput();

    const videoUrl = task.output?.[0];
    if (!videoUrl) {
      throw new Error(`Runway ${modelId} returned no video URL`);
    }

    return { videoUrl, durationSeconds: req.apiDuration };
  }
}
