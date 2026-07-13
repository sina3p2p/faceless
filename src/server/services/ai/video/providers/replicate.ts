import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IImageRequest, IProvider, VideoResult } from "@/types/video-provider";
import { pollUntil } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";
import { BaseVideoProvider } from "./base";

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
export class ReplicateVideoProvider extends BaseVideoProvider {
  readonly client: AxiosInstance;
  constructor() {
    const token = AI_VIDEO.replicateToken;
    if (!token) {
      throw new Error("REPLICATE_API_TOKEN is not set (required for Replicate video generation)");
    }
    super();
    this.client = axios.create({
      baseURL: "https://api.replicate.com/v1",
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  findModel(model: TVideoModelId): string | undefined {
    return ({
      'seedance-2-pro': 'bytedance/seedance-2.0',
      'seedance-2-fast': 'bytedance/seedance-2.0-fast',
    } as Partial<Record<TVideoModelId, string>>)[model];
  }
  generateInput(req: I2vRequest): Record<string, unknown> {
    switch (req.model) {
      case "seedance-2-pro":
      case "seedance-2-fast":
        return {
          image: req.startImageUrl,
          last_frame_image: req.endImageUrl,
          reference_images: req.referenceImages,
          prompt: req.prompt,
          duration: req.duration,
          aspect_ratio: req.aspectRatio,
          resolution: req.resolution,
          generate_audio: req.generateAudio ?? false,
        };
      default:
        throw new Error(`Replicate: video model ${req.model} is not implemented for Replicate. Use Fal.ai or a mapped Seedance model.`);
    }
  }
  private pollPrediction(predictionId: string, expectedDuration: number): Promise<VideoResult> {
    return pollUntil(async () => {
      const { data } = await this.client.get(`predictions/${predictionId}`);
      if (data.status === 'succeeded') {
        return { videoUrl: extractOutputUrl(data.output), durationSeconds: expectedDuration };
      }
      if (data.status === 'failed' || data.status === 'canceled') {
        throw new Error(`Replicate: prediction ${data.status}: ${data.error ?? data.status}`);
      }
      return null;
    });
  }

  async generateVideo(req: I2vRequest): Promise<VideoResult> {
    const input = this.generateInput(req);
    const model = this.findModel(req.model);
    if (!model) {
      throw new Error(`Replicate: video model ${req.model} is not implemented for Replicate. Use Fal.ai or a mapped Seedance model.`);
    }
    const prediction = await this.client.post('predictions', { input, version: model });
    return this.pollPrediction(prediction.data.id, req.duration);
  }

  async generateImage(_: IImageRequest): Promise<string[]> {
    throw new Error("KIE: image generation is not supported");
  }
}
