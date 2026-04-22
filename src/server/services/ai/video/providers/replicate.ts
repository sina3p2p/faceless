import { AI_VIDEO } from "@/lib/constants";
import type { I2vRequest, IVideoProvider, ResolvedVideoModel, VideoResult } from "@/types/video-provider";

const REPLICATE_API = "https://api.replicate.com/v1";

const versionCache = new Map<string, string>();

function mapAspectSeedance(ar: string): "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16" {
  if (ar === "21:9" || ar === "16:9" || ar === "4:3" || ar === "1:1" || ar === "3:4" || ar === "9:16") {
    return ar;
  }
  return "auto";
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

function buildSeedanceInput(
  modelId: string,
  req: I2vRequest,
  resolved: ResolvedVideoModel
): Record<string, unknown> {
  const { resolution, generateAudio } = resolved;
  const useEnd = req.endFrame && !!req.endImageUrl;
  const input: Record<string, unknown> = {
    image: req.imageUrl,
    prompt: req.prompt,
    duration: req.apiDuration,
    aspect_ratio: mapAspectSeedance(req.aspectRatio),
    resolution: resolution ?? "720p",
    generate_audio: generateAudio ?? false,
  };
  if (modelId === "seedance-2-pro" || modelId === "seedance-2-fast") {
    if (useEnd && req.endImageUrl) input.end_image = req.endImageUrl;
  }
  return input;
}

async function getLatestVersionId(
  modelRef: `${string}/${string}`,
  token: string
): Promise<string> {
  const c = versionCache.get(modelRef);
  if (c) return c;
  const r = await fetch(`${REPLICATE_API}/models/${modelRef}`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Replicate: failed to read model ${modelRef}: ${r.status} ${t.slice(0, 200)}`);
  }
  const j = (await r.json()) as { latest_version?: { id: string } };
  const v = j.latest_version?.id;
  if (!v) throw new Error(`Replicate: no latest_version for ${modelRef}`);
  versionCache.set(modelRef, v);
  return v;
}

async function createAndWaitPrediction(
  versionId: string,
  input: Record<string, unknown>,
  token: string
): Promise<unknown> {
  const r = await fetch(`${REPLICATE_API}/predictions`, {
    method: "POST",
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: versionId, input }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Replicate: prediction create failed: ${r.status} ${t.slice(0, 500)}`);
  }
  const pred = (await r.json()) as { id: string; status: string; error?: string; output?: unknown; urls?: { get?: string } };
  let p = pred;
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

export class ReplicateVideoProvider implements IVideoProvider {
  async generateFromImage(req: I2vRequest, resolved: ResolvedVideoModel): Promise<VideoResult> {
    const token = AI_VIDEO.replicateToken;
    if (!token) {
      throw new Error("REPLICATE_API_TOKEN is not set (required for Replicate video generation)");
    }
    const { replicateModel, modelId } = resolved;
    if (!replicateModel) {
      throw new Error("Replicate: model is not bound to a Replicate id (replicateModel). Pick Seedance 2 on Replicate or use Fal.");
    }
    if (modelId === "seedance-2-pro" || modelId === "seedance-2-fast") {
      const versionId = await getLatestVersionId(replicateModel, token);
      const input = buildSeedanceInput(modelId, req, resolved);
      console.log(
        `[ai-video] Replicate ${replicateModel} (version ${versionId}) duration=${req.apiDuration}s resolution=${resolved.resolution ?? "default"}`
      );
      const output = await createAndWaitPrediction(versionId, input, token);
      return { videoUrl: extractOutputUrl(output), durationSeconds: req.apiDuration };
    }
    throw new Error(
      `Replicate: video model ${modelId} is not implemented for Replicate. Use Fal.ai or a mapped Seedance model.`
    );
  }
}
