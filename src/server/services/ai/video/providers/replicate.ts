import { AI_VIDEO, VIDEO_MODELS } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, VideoResult } from "@/types/video-provider";
import { sleep } from "@/lib/utils";
import axios, { AxiosInstance } from "axios";

const REPLICATE_API = "https://api.replicate.com/v1";

/** Serialize POST /v1/predictions so we never issue parallel creates (Replicate throttles burst=1 in low-balance mode). */
let createPostQueue: Promise<unknown> = Promise.resolve();

const CREATE_PREDICTION_MAX_ATTEMPTS = 15;

function parseReplicateCreateError(body: string): { retryAfterSec: number } | null {
  try {
    const j = JSON.parse(body) as { retry_after?: number; status?: number };
    if (typeof j.retry_after === "number" && j.retry_after >= 0) {
      return { retryAfterSec: j.retry_after };
    }
  } catch {
    // ignore
  }
  return null;
}

async function withCreatePostLock<T>(fn: () => Promise<T>): Promise<T> {
  const p = createPostQueue.then(() => fn());
  createPostQueue = p.then(
    () => undefined,
    () => undefined
  );
  return p;
}

type PredictionResponse = { id: string; status: string; error?: string; output?: unknown; urls?: { get?: string } };

async function postPredictionCreate(
  versionId: string,
  input: Record<string, unknown>,
  token: string
): Promise<PredictionResponse> {
  return withCreatePostLock(async () => {
    for (let attempt = 0; attempt < CREATE_PREDICTION_MAX_ATTEMPTS; attempt++) {
      const r = await fetch(`${REPLICATE_API}/predictions`, {
        method: "POST",
        headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version: versionId, input }),
      });
      const t = await r.text();
      if (r.ok) {
        return JSON.parse(t) as PredictionResponse;
      }
      if (r.status === 429) {
        const meta = parseReplicateCreateError(t);
        const sec = meta?.retryAfterSec ?? 10;
        if (attempt === CREATE_PREDICTION_MAX_ATTEMPTS - 1) {
          throw new Error(`Replicate: prediction create failed: 429 after ${CREATE_PREDICTION_MAX_ATTEMPTS} attempts ${t.slice(0, 500)}`);
        }
        const jitter = Math.random() * 500;
        console.warn(
          `[ai-video] Replicate create throttled (429), waiting ~${sec}s + jitter before retry (${attempt + 1}/${CREATE_PREDICTION_MAX_ATTEMPTS})`
        );
        await sleep(sec * 1000 + jitter);
        continue;
      }
      throw new Error(`Replicate: prediction create failed: ${r.status} ${t.slice(0, 500)}`);
    }
    throw new Error("Replicate: prediction create failed: exhausted retries");
  });
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


async function createAndWaitPrediction(
  versionId: string,
  input: Record<string, unknown>,
  token: string
): Promise<unknown> {
  let p: PredictionResponse = await postPredictionCreate(versionId, input, token);
  for (let i = 0; i < 900; i++) {
    if (p.status === "succeeded" || p.status === "failed" || p.status === "canceled") break;
    await new Promise((res) => setTimeout(res, 2000));
    const u = p.urls?.get ?? `${REPLICATE_API}/predictions/${p.id}`;
    const pr = await fetch(u, { headers: { Authorization: `Token ${token}` } });
    if (!pr.ok) {
      const t = await pr.text();
      throw new Error(`Replicate: poll failed: ${pr.status} ${t.slice(0, 200)}`);
    }
    p = (await pr.json()) as typeof p;
  }
  if (p.status === "failed" || p.status === "canceled") {
    throw new Error(p.error || `Replicate: prediction ${p.status}`);
  }
  if (p.status !== "succeeded" || p.output == null) {
    throw new Error("Replicate: prediction did not return output in time");
  }
  return p.output;
}

function generateInput(model: TVideoModelId, req: I2vRequest): Record<string, unknown> {
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
    default:
      throw new Error(`Replicate: video model ${model} is not implemented for Replicate. Use Fal.ai or a mapped Seedance model.`);
  }
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
  async generateFromImage(req: I2vRequest, model: TVideoModelId): Promise<VideoResult> {
    return {
      videoUrl: "",
      durationSeconds: 0,
    }
    // const input = generateInput(model, req);
    // const output = await createAndWaitPrediction(replicateModel, input, token);
    // return { videoUrl: extractOutputUrl(output), durationSeconds: req.apiDuration };
  }
}
