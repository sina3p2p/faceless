import { AI_VIDEO, VIDEO_MODELS, LIPSYNC } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "@/types/video-provider";
import { sleep } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";

const REPLICATE_API = "https://api.replicate.com/v1";

// Per-model `negative_prompt` baselines. Both Kling v2.5 Turbo Pro and
// Pixverse V6 expose a dedicated `negative_prompt` Replicate input — using it
// outperforms burying negatives in the positive prompt (documented to HURT
// Pixverse V6 quality, and Kling responds best to 5–8 focused terms rather
// than long inline lists). See docs/video-model-prompts.md for sources.
const NEGATIVE_PROMPTS: Partial<Record<TVideoModelId, string>> = {
  "kling-v2.5-turbo-pro":
    "blur, distortion, warping, extra fingers, jittery motion, low quality, watermark",
  "pixverse-v6":
    "extra fingers, distorted hands, morphing, warping, deformed face, text, watermark, shaky camera, sudden cuts, fast zoom, jitter, flicker, low quality",
};

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
          last_frame_image: req.endImageUrl,
          prompt: req.prompt,
          duration: req.duration,
          aspect_ratio: req.aspectRatio,
          resolution: req.resolution,
          generate_audio: false,
        };
      case "kling-v2.5-turbo-pro":
        return {
          start_image: req.startImageUrl,
          end_image: req.endImageUrl,
          prompt: req.prompt,
          negative_prompt: NEGATIVE_PROMPTS[model],
          duration: req.duration,
          aspect_ratio: req.aspectRatio,
        };
      case "pixverse-v6":
        return {
          image: req.startImageUrl,
          last_frame_image: req.endImageUrl,
          prompt: req.prompt,
          negative_prompt: NEGATIVE_PROMPTS[model],
          duration: req.duration,
          aspect_ratio: req.aspectRatio,
          quality: req.resolution,
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

  /**
   * Lip-sync a clip to an audio track via a dedicated Replicate model (e.g.
   * `sync/lipsync-2`). Separate from the i2v path so the i2v input switch is
   * untouched. Inputs are URLs (Replicate pulls them), mirroring how i2v
   * passes the image URL.
   */
  async lipSync(videoUrl: string, audioUrl: string): Promise<VideoResult> {
    const input = { video: videoUrl, audio: audioUrl };
    const prediction = await this.client.post('predictions', { input, version: LIPSYNC.version });
    const predictionId = prediction.data.id;
    let status = 'pending';
    while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled') {
      await sleep(2000);
      const response = await this.client.get(`predictions/${predictionId}`);
      status = response.data.status;
      if (status === 'succeeded') {
        return { videoUrl: extractOutputUrl(response.data.output), durationSeconds: 0 };
      }
    }
    throw new Error(`Replicate: lip-sync prediction ${status}`);
  }
}
