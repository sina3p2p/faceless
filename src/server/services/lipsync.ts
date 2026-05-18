import axios from "axios";
import { AI_VIDEO, LIPSYNC } from "@/lib/constants";
import { sleep } from "@/lib/utils";

const REPLICATE_API = "https://api.replicate.com/v1";

function extractOutputUrl(out: unknown): string {
  if (typeof out === "string" && /^https?:\/\//.test(out)) return out;
  if (out && typeof out === "object" && "url" in out && typeof (out as { url: unknown }).url === "string") {
    return (out as { url: string }).url;
  }
  if (Array.isArray(out) && out[0] != null) return extractOutputUrl(out[0]);
  throw new Error("Replicate lip-sync returned no output URL");
}

/**
 * SPIKE: drive a talking face by audio. Sends a silent clip + the scene's
 * TTS audio to a Replicate lip-sync model and returns the synced video URL.
 *
 * Mirrors the house Replicate pattern (see ai/video/providers/replicate.ts):
 * plain axios + version + poll. The configured model must accept
 * `{ video, audio }` inputs (latentsync / video-retalking family).
 */
export async function generateLipSyncedClip(
  videoUrl: string,
  audioUrl: string
): Promise<string> {
  const token = AI_VIDEO.replicateToken;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set (required for lip sync)");
  if (!LIPSYNC.version) throw new Error("REPLICATE_LIPSYNC_VERSION is not set");

  const client = axios.create({
    baseURL: REPLICATE_API,
    headers: { Authorization: `Bearer ${token}` },
  });

  const prediction = await client.post("predictions", {
    version: LIPSYNC.version,
    input: { video: videoUrl, audio: audioUrl },
  });

  const predictionId = prediction.data.id;
  let status = "pending";
  while (status !== "succeeded" && status !== "failed" && status !== "canceled") {
    await sleep(2000);
    const res = await client.get(`predictions/${predictionId}`);
    status = res.data.status;
    if (status === "succeeded") return extractOutputUrl(res.data.output);
  }
  throw new Error(`Replicate lip-sync prediction ${status}`);
}
