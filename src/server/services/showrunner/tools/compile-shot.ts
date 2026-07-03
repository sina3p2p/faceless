import { tool } from "ai";
import { z } from "zod";
import { generateVideoFromReferences, type VideoResult } from "@/server/services/ai/video";
import { isE005, addSeedanceNoiseEnhanced } from "@/server/services/ai/video/seedance-noise";
import { uploadFile, mediaUrl } from "@/lib/storage";

export const compileShot = tool({
  description:
    "Compile a shot prompt package and present it to the user for review before any rendering happens. " +
    "Assemble the full Seedance 2.0 prompt from the Bible per the shot-compilation-recipe, then call this tool. " +
    "The user will review and optionally edit the prompt, then approve — rendering starts only after their approval. " +
    "Wait for the user's shot approval before calling this again for the next shot. " +
    "Never batch multiple independent shots in a single call — one call = one shot. " +
    "Only available after the Bible is locked and all asset images are approved.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe("Full compiled Seedance 2.0 prompt, assembled from the Bible per the shot-compilation-recipe. This is what the user will review and optionally edit before rendering."),
    referenceImageUrls: z
      .array(z.string())
      .describe("Approved reference image URLs for the @material handles that appear in this shot, in binding order ([Image1], [Image2], …). Max 9."),
    duration: z
      .number()
      .int()
      .min(4)
      .max(15)
      .describe("Target clip duration in seconds (4–15). Use the value from the shot row."),
    aspectRatio: z
      .enum(["16:9", "9:16", "1:1"])
      .default("16:9")
      .describe("Aspect ratio — default 16:9 for cinematic film."),
  }),
});

/**
 * Generate a shot via Seedance reference mode, with an automatic E005 fallback:
 * if Seedance rejects the images with E005, apply enhanced Gaussian perturbation
 * to all reference images and retry once.
 */
export async function generateShotWithFallback(
  referenceImageUrls: string[],
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1" = "16:9",
  duration: number,
  sessionId: string
): Promise<VideoResult> {
  const run = (urls: string[]) =>
    generateVideoFromReferences(urls, [], prompt, 'seedance-2-mini', aspectRatio, "480p", duration);

  try {
    return await run(referenceImageUrls);
  } catch (err) {
    if (isE005(err)) {
      const noisedUrls = await Promise.all(
        referenceImageUrls.map((url, i) =>
          addSeedanceNoiseEnhanced(url, `ref${i}`, `story_${sessionId}`)
        )
      );
      return await run(noisedUrls);
    }
    throw err;
  }
}

/**
 * Render the shot then re-upload the video to R2 — used by both the async
 * shot-queue worker and the synchronous retry-tool route. Replicate's URLs
 * expire, so the result is never persisted as-is.
 */
export async function renderAndUploadShot(
  referenceImageUrls: string[],
  prompt: string,
  aspectRatio: "16:9" | "9:16" | "1:1",
  duration: number,
  sessionId: string,
  storageKey: string
): Promise<string> {
  const result = await generateShotWithFallback(referenceImageUrls, prompt, aspectRatio, duration, sessionId);
  const videoResp = await fetch(result.videoUrl);
  const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
  await uploadFile(storageKey, videoBuffer, "video/mp4");
  return mediaUrl(storageKey);
}
