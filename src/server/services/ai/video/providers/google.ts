import axios, { type AxiosInstance } from "axios";
import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "../types";

const GENAI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function extractVeoVideoUri(st: Record<string, unknown>): string | undefined {
  const resp = st.response as Record<string, unknown> | undefined;
  if (!resp) return undefined;
  const gvr = (resp.generateVideoResponse ?? resp.generate_video_response) as
    | Record<string, unknown>
    | undefined;
  if (!gvr) return undefined;
  const samples = (gvr.generatedSamples ?? gvr.generated_samples) as unknown[] | undefined;
  const first = samples?.[0] as Record<string, unknown> | undefined;
  const video = first?.video as Record<string, unknown> | undefined;
  if (!video) return undefined;
  return (
    (video.uri as string) ||
    (video.gcsUri as string) ||
    (video.gcs_uri as string) ||
    undefined
  );
}

function mapAspectRatio(ar: string): string {
  if (ar === "16:9" || ar === "9:16" || ar === "1:1") return ar;
  return "9:16";
}

function resolutionForModel(modelId: string): "720p" | "1080p" {
  return modelId.includes("lite") ? "720p" : "1080p";
}

export class GoogleVideoProvider implements IVideoProvider {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ timeout: 120_000 });
  }

  private getApiKey(): string {
    const apiKey = AI_VIDEO.googleGenaiApiKey;
    if (!apiKey) {
      throw new Error("GOOGLE_GENAI_API_KEY is not set");
    }
    return apiKey;
  }

  private async fetchImageAsBase64(imageUrl: string): Promise<{ b64: string; mimeType: string }> {
    const res = await this.http.get<ArrayBuffer>(imageUrl, { responseType: "arraybuffer" });
    const ct = res.headers["content-type"]?.split(";")[0]?.trim() || "image/jpeg";
    const mimeType = ct || "image/jpeg";
    const b64 = Buffer.from(res.data).toString("base64");
    return { b64, mimeType };
  }

  async generateFromImage(req: I2vRequest, modelId: string): Promise<VideoResult> {
    const apiKey = this.getApiKey();
    const { b64, mimeType } = await this.fetchImageAsBase64(req.imageUrl);

    const body = {
      instances: [
        {
          prompt: req.prompt,
          image: {
            bytesBase64Encoded: b64,
            mimeType,
          },
        },
      ],
      parameters: {
        aspectRatio: mapAspectRatio(req.aspectRatio),
        durationSeconds: req.apiDuration,
        resolution: resolutionForModel(modelId),
      },
    };

    const url = `${GENAI_BASE}/models/${modelId}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
    console.log(`[ai-video] google predictLongRunning model=${modelId} duration=${req.apiDuration}s`);

    const { data: op } = await this.http.post<{ name?: string; error?: { message?: string } }>(
      url,
      body,
      { headers: { "Content-Type": "application/json" } }
    );

    if (op.error?.message) {
      throw new Error(`Google Veo: ${op.error.message}`);
    }
    const opName = op.name;
    if (!opName) {
      throw new Error("Google Veo predictLongRunning returned no operation name");
    }

    const pollUrl = `${GENAI_BASE}/${opName}?key=${encodeURIComponent(apiKey)}`;
    const intervalMs = 8000;
    const maxWaitMs = 900_000;
    const t0 = Date.now();

    while (Date.now() - t0 < maxWaitMs) {
      const { data: st } = await this.http.get<Record<string, unknown>>(pollUrl);

      const err = st.error as { message?: string } | undefined;
      if (err?.message) {
        throw new Error(`Google Veo operation error: ${err.message}`);
      }
      if (st.done) {
        const uri = extractVeoVideoUri(st);
        if (!uri) {
          throw new Error("Google Veo completed but returned no video URI");
        }
        return { videoUrl: uri, durationSeconds: req.apiDuration };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error("Google Veo video generation timed out");
  }
}
