import axios, { type AxiosInstance } from "axios";
import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "../types";

const XAI_BASE = "https://api.x.ai/v1";

function aspectForGrok(ar: string): string {
  if (ar === "16:9" || ar === "9:16" || ar === "1:1") return ar;
  return "9:16";
}

export class GrokVideoProvider implements IVideoProvider {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ timeout: 120_000 });
  }

  private getAuthHeaders(): Record<string, string> {
    const apiKey = AI_VIDEO.xaiApiKey;
    if (!apiKey) {
      throw new Error("XAI_API_KEY is not set");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  }

  async generateFromImage(req: I2vRequest, modelId: string): Promise<VideoResult> {
    const headers = this.getAuthHeaders();

    const body = {
      model: modelId || "grok-imagine-video",
      prompt: req.prompt,
      image: { url: req.imageUrl },
      duration: req.apiDuration,
      aspect_ratio: aspectForGrok(req.aspectRatio),
      resolution: "720p" as const,
    };

    console.log(`[ai-video] grok POST /v1/videos/generations duration=${req.apiDuration}s`);

    const start = await this.http.post<{ request_id?: string }>(
      `${XAI_BASE}/videos/generations`,
      body,
      { headers }
    );
    const requestId = start.data?.request_id;
    if (!requestId) {
      throw new Error("xAI video generation returned no request_id");
    }

    const intervalMs = 5000;
    const maxWaitMs = 900_000;
    const t0 = Date.now();

    while (Date.now() - t0 < maxWaitMs) {
      const { data } = await this.http.get<{
        status?: string;
        video?: { url?: string; duration?: number };
      }>(`${XAI_BASE}/videos/${requestId}`, { headers });

      if (data.status === "done") {
        const videoUrl = data.video?.url;
        if (!videoUrl) throw new Error("xAI returned done but no video URL");
        const dur = data.video?.duration ?? req.apiDuration;
        return { videoUrl, durationSeconds: dur };
      }
      if (data.status === "failed" || data.status === "expired") {
        throw new Error(`xAI video generation ${data.status}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error("xAI video generation timed out");
  }
}
