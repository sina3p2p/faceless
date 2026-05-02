import { AI_VIDEO, VIDEO_MODELS } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "@/types/video-provider";
import { sleep } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";

const REPLICATE_API = "https://api.replicate.com/v1";

function extractOutputUrl(out: unknown): string {
  if (typeof out === "string" && (out.startsWith("http://") || out.startsWith("https://"))) {
    return out;
  }
  if (out && typeof out === "object" && out !== null && "url" in out && typeof (out as { url: string }).url === "string") {
    return (out as { url: string }).url;
  }
  if (Array.isArray(out) && out[0] != null) {
    return extractOutputUrl(out[0]);
  }
  throw new Error("Replicate returned no video URL in output");
}
export class ReplicateVideoProvider implements IVideoProvider {
  readonly client: AxiosInstance;
  constructor() {
    const token = AI_VIDEO.replicateToken;
    if (!token) {
      throw new Error("REPLICATE_API_TOKEN is not set (required for Replicate video generation)");
    }
    this.client = axios.create({
      baseURL: REPLICATE_API,
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  generateInput(model: TVideoModelId, req: I2vRequest): Record<string, unknown> {
    switch (model) {
      case "seedance-2-pro":
      case "seedance-2-fast":
        return {
          image: req.startImageUrl,
          prompt: req.prompt,
          duration: req.duration,
          aspect_ratio: req.aspectRatio,
          resolution: VIDEO_MODELS[model].supportedResolution[0],
          generate_audio: false,
        };
      case "kling-v2.5-turbo-pro":
        return {
          start_image: req.startImageUrl,
          end_image: req.endImageUrl,
          prompt: req.prompt,
          duration: req.duration,
          aspect_ratio: req.aspectRatio,
        };
      default:
        throw new Error(`Replicate: video model ${model} is not implemented for Replicate. Use Fal.ai or a mapped Seedance model.`);
    }
  }
  async generateFromImage(req: I2vRequest, model: TVideoModelId): Promise<VideoResult> {
    const input = this.generateInput(model, req);
    const prediction = await this.client.post('predictions', { input, version: VIDEO_MODELS[model].endpoint });
    const predictionId = prediction.data.id;
    let status = 'pending';
    while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled') {
      await sleep(2000);
      const response = await this.client.get(`predictions/${predictionId}`);
      status = response.data.status;
      if (status === 'succeeded') {
        return { videoUrl: extractOutputUrl(response.data.output), durationSeconds: req.duration };
      }
    }
    throw new Error(`Replicate: prediction ${status}`);
  }
}
