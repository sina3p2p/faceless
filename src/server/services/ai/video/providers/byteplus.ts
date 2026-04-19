import axios, { type AxiosInstance } from "axios";
import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "@/types/video-provider";

/** BytePlus ModelArk data-plane (international). See https://docs.byteplus.com/en/docs/ModelArk/1298459 */
function mapRatio(aspectRatio: string): string {
  if (
    aspectRatio === "16:9" ||
    aspectRatio === "9:16" ||
    aspectRatio === "1:1" ||
    aspectRatio === "4:3" ||
    aspectRatio === "3:4" ||
    aspectRatio === "21:9"
  ) {
    return aspectRatio;
  }
  return "9:16";
}

function resolutionForModel(modelId: string): "720p" | "1080p" {
  if (modelId.includes("fast")) return "720p";
  return "720p";
}

function extractVideoUrl(body: Record<string, unknown>): string | undefined {
  const content = body.content as Record<string, unknown> | undefined;
  if (!content) return undefined;
  return (
    (content.video_url as string | undefined) ||
    (content.videoUrl as string | undefined) ||
    undefined
  );
}

function extractErrorMessage(body: Record<string, unknown>): string | undefined {
  const err = body.error as { message?: string } | undefined;
  return err?.message;
}

export class BytePlusVideoProvider implements IVideoProvider {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({ timeout: 120_000 });
  }

  private getAuthHeaders(): Record<string, string> {
    const apiKey = AI_VIDEO.byteplusArkApiKey;
    if (!apiKey) {
      throw new Error("PROVIDER_BYTEPLUS_ARK_API_KEY is not set");
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    };
  }

  private taskBase(): string {
    const base = AI_VIDEO.byteplusArkBaseUrl.replace(/\/$/, "");
    if (!base) throw new Error("BYTEPLUS_ARK_BASE_URL is empty");
    return `${base}/contents/generations/tasks`;
  }

  async generateFromImage(req: I2vRequest, modelId: string): Promise<VideoResult> {
    const headers = this.getAuthHeaders();

    const content: Array<Record<string, unknown>> = [
      { type: "text", text: req.prompt },
      {
        type: "image_url",
        image_url: { url: req.imageUrl },
        role: "first_frame",
      },
    ];
    if (req.endFrame && req.endImageUrl) {
      content.push({
        type: "image_url",
        image_url: { url: req.endImageUrl },
        role: "last_frame",
      });
    }

    const ratio =
      req.endFrame && req.endImageUrl ? mapRatio(req.aspectRatio) : "adaptive";
    const resolution = resolutionForModel(modelId);

    const body: Record<string, unknown> = {
      model: modelId,
      content,
      ratio,
      duration: req.apiDuration,
      resolution,
    };

    const url = this.taskBase();
    console.log(`[ai-video] byteplus POST .../tasks model=${modelId} duration=${req.apiDuration}s ratio=${ratio}`);

    let created: Record<string, unknown>;
    try {
      const res = await this.http.post<Record<string, unknown>>(url, body, { headers });
      created = res.data;
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.data && typeof e.response.data === "object") {
        const d = e.response.data as Record<string, unknown>;
        const m = extractErrorMessage(d) || JSON.stringify(d);
        throw new Error(`BytePlus video task: ${m}`);
      }
      throw e;
    }
    const msg = extractErrorMessage(created);
    if (msg) throw new Error(`BytePlus video task: ${msg}`);

    const taskId = created.id as string | undefined;
    if (!taskId) {
      throw new Error("BytePlus video generation returned no task id");
    }

    const pollUrl = `${url}/${taskId}`;
    const intervalMs = 15_000;
    const maxWaitMs = 900_000;
    const t0 = Date.now();

    while (Date.now() - t0 < maxWaitMs) {
      const { data: st } = await this.http.get<Record<string, unknown>>(pollUrl, { headers });
      const status = st.status as string | undefined;
      const errMsg = extractErrorMessage(st);
      if (errMsg) throw new Error(`BytePlus video task: ${errMsg}`);

      if (status === "succeeded") {
        const videoUrl = extractVideoUrl(st);
        if (!videoUrl) throw new Error("BytePlus task succeeded but returned no video URL");
        return { videoUrl, durationSeconds: req.apiDuration };
      }
      if (status === "failed" || status === "expired" || status === "cancelled") {
        throw new Error(`BytePlus video generation ${status}`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error("BytePlus video generation timed out");
  }
}
