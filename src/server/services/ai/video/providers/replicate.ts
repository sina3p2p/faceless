import type { ModelMessage } from "ai";
import { AI_VIDEO, VIDEO_MODELS, LLM } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "@/types/video-provider";
import { sleep } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";
import { generateText } from "@/server/services/ai-audit";
import { openrouter } from "@/server/services/ai/llm";

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

const CORRECTION_AGENT_SYSTEM_PROMPT =
  "You are a video prompt safety editor for an AI video generation system. " +
  "Rewrite prompts that were rejected by content moderation while preserving visual and narrative intent. " +
  "Remove or rephrase: graphic violence, gore, explicit content, nudity, dangerous acts, real person likenesses, self-harm. " +
  "You will be shown your previous corrections and told they were still flagged — learn from each rejection and try a different approach. " +
  "Respond with ONLY the rewritten prompt. No explanation, no preamble, no quotes.";

const SENSITIVE_CONTENT_RETRY_LIMIT = 3;

function isSensitiveContentError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("E005") || msg.toLowerCase().includes("flagged as sensitive");
}

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
          generate_audio: req.generateAudio ?? false,
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
    let errorDetail: string = status;
    while (status !== 'succeeded' && status !== 'failed' && status !== 'canceled') {
      await sleep(3000);
      const response = await this.client.get(`predictions/${predictionId}`);
      status = response.data.status;
      errorDetail = response.data.error ?? status;
      if (status === 'succeeded') {
        return { videoUrl: extractOutputUrl(response.data.output), durationSeconds: req.duration };
      }
    }
    throw new Error(`Replicate: prediction ${status}: ${errorDetail}`);
  }

  /**
   * Like generateFromImage but with a built-in correction agent: on sensitive-
   * content rejections (E005) the agent rewrites the prompt using a growing
   * chat history so each attempt is informed by every prior failure.
   */
  async generateFromImageSafe(req: I2vRequest, model: TVideoModelId): Promise<VideoResult> {
    let currentPrompt = req.prompt;
    let lastCorrection: string | null = null;
    const history: ModelMessage[] = [
      { role: "system", content: CORRECTION_AGENT_SYSTEM_PROMPT },
      {
        role: "user",
        content: `This video generation prompt was flagged by content moderation. Rewrite it to pass safety filters:\n\n${currentPrompt}`,
      },
    ];

    for (let attempt = 1; attempt <= SENSITIVE_CONTENT_RETRY_LIMIT; attempt++) {
      try {
        return await this.generateFromImage({ ...req, prompt: currentPrompt }, model);
      } catch (err) {
        if (attempt < SENSITIVE_CONTENT_RETRY_LIMIT && isSensitiveContentError(err)) {
          console.warn(
            `[replicate] Prompt flagged as sensitive (attempt ${attempt}/${SENSITIVE_CONTENT_RETRY_LIMIT}), asking correction agent…`
          );
          if (lastCorrection !== null) {
            history.push({ role: "assistant", content: lastCorrection });
            history.push({
              role: "user",
              content:
                "That rewrite was still flagged. Try a completely different approach — " +
                "avoid whatever you changed in your previous attempt.",
            });
          }
          const { text } = await generateText({
            model: openrouter.chat(LLM.fallbackModel),
            messages: history,
          });
          lastCorrection = text.trim();
          currentPrompt = lastCorrection;
        } else {
          throw err;
        }
      }
    }
    throw new Error("Replicate: video generation failed after all content moderation retries");
  }
}
