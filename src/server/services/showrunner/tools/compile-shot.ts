import { tool } from "ai";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { generateVideo, type VideoResult } from "@/server/services/ai/video";
import { addSeedanceNoiseEnhanced } from "@/server/services/ai/video/seedance-noise";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { probeVideoDuration, generateFilmstripJpeg } from "@/lib/media-probe";
import { db } from "@/server/db";
import { filmSessions, media } from "@/server/db/schema";

export const CONTINUITY_MODES = ["fresh", "extend_video"] as const;
type ContinuityMode = (typeof CONTINUITY_MODES)[number];

export const compileShot = tool({
  description:
    "Compile a shot prompt package and present it to the user for review before any rendering happens. " +
    "Only after Stage 1 is complete (registry passing): load stage2-skill.md and shot-compilation-recipe.md, " +
    "assemble the Seedance 2.0 prompt from the Bible, then call this tool. " +
    "One compile = one motion sheet = one shot. " +
    "Use continuityMode 'extend_video' + sourceVideoUrl (previous approved clip) when the next beat " +
    "continues the same character through the same space (walks / approaches / same-surface carries). " +
    "Use 'fresh' for scene opens, clean breaks, and hard cuts that start a new take. " +
    "Attach referenceImageUrls in precision order: character → object → location → " +
    "scene anchor (scene's first approved sheet) → incoming anchor → motion sheet. " +
    "Prompt must interpolate the motion sheet (continuous take; no hard cuts; never show grid/gutters) " +
    "with COMPOSITION LOCK on Panel 1 and END STATE LOCK on Panel n. " +
    "The user reviews/edits the prompt, then approves — rendering starts only after approval. " +
    "Wait for shot approval before compiling the next shot.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe(
        "Full compiled Seedance 2.0 prompt from the Bible per the shot-compilation-recipe. " +
        "For extend_video, open with Extend <Video_1>: … (never say 'reference <Video_1>'). " +
        "When continuing across clips, CONTEXT must restate footing from the previous last frame."
      ),
    referenceImageUrls: z
      .array(z.string())
      .max(9)
      .describe(
        "Approved reference image URLs in precision order: character → object → location → " +
        "scene anchor (scene's first approved sheet, when later in scene) → " +
        "incoming anchor (prior terminal panel / last frame, when continuous) → motion sheet. " +
        "Required for fresh; optional for extend_video when identity is carried by the source clip " +
        "(still attach sheet + scene/incoming anchors when available)."
      ),
    duration: z
      .number()
      .int()
      .min(4)
      .max(15)
      .describe("Target clip duration in seconds (4–15). Solo = shot Dur; avoid padding with unused group sums."),
    aspectRatio: z
      .enum(["16:9", "9:16", "1:1"])
      .default("16:9")
      .describe("Aspect ratio — default 16:9 for cinematic film."),
    continuityMode: z
      .enum(CONTINUITY_MODES)
      .default("fresh")
      .describe(
        "fresh = stills-only (scene open / clean break / new take). " +
        "extend_video = continue from previous approved clip (walks / continuous action)."
      ),
    sourceVideoUrl: z
      .string()
      .optional()
      .describe("Required for extend_video: the previous approved clip URL to continue from."),
  }),
});

export type CompileShotArgs = {
  prompt: string;
  referenceImageUrls: string[];
  duration: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  continuityMode?: ContinuityMode;
  sourceVideoUrl?: string;
};

export function validateCompileContinuity(args: CompileShotArgs): string[] {
  const mode = args.continuityMode ?? "fresh";
  const errors: string[] = [];
  if (mode === "extend_video" && !args.sourceVideoUrl) {
    errors.push("extend_video requires sourceVideoUrl (the previous approved clip URL).");
  }
  if (mode === "fresh" && (!args.referenceImageUrls || args.referenceImageUrls.length === 0)) {
    errors.push("fresh mode requires at least one referenceImageUrl.");
  }
  return errors;
}

/**
 * Generate a shot via Seedance, with continuity mode support and E005 fallback
 * for reference-image rejection.
 *
 * Modes:
 * - fresh → multimodal reference stills only
 * - extend_video → reference video (+ optional stills)
 */
export async function generateShotWithFallback(
  args: CompileShotArgs,
  sessionId: string
): Promise<VideoResult> {
  const mode = args.continuityMode ?? "fresh";
  const aspectRatio = args.aspectRatio ?? "16:9";
  const refs = args.referenceImageUrls ?? [];

  const run = (urls: string[]) =>
    generateVideo({
      model: "seedance-2-mini",
      referenceImages: urls,
      referenceVideos: mode === "extend_video" && args.sourceVideoUrl ? [args.sourceVideoUrl] : undefined,
      prompt: args.prompt,
      duration: args.duration,
      aspectRatio,
      resolution: "480p",
      generateAudio: true,
    });

  try {
    return await run(refs);
  } catch (err) {
    console.warn("Rejecting reference images, adding noise and retrying", { sessionId, refs });
    if (refs.length > 0) {
      const noisedUrls = await Promise.all(
        refs.map((url, i) => addSeedanceNoiseEnhanced(url, `ref${i}`, `story_${sessionId}`))
      );
      return await run(noisedUrls);
    }
    throw err;
  }
}

export interface UploadedShot {
  url: string;
  durationSeconds: number;
  mediaId: string;
  /** Storage key for the horizontal filmstrip JPEG (optional if generation fails). */
  filmstripUrl?: string;
  /** Number of frames in the filmstrip sprite (~1/sec). */
  filmstripTiles?: number;
}

/**
 * Render the shot then re-upload the video to R2 — used by both the async
 * worker-jobs queue and the retry-tool route.
 */
export async function renderAndUploadShot(
  args: CompileShotArgs,
  sessionId: string,
  storageKey: string
): Promise<UploadedShot> {
  const errors = validateCompileContinuity(args);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const result = await generateShotWithFallback(args, sessionId);
  const videoResp = await fetch(result.videoUrl);
  const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
  await uploadFile(storageKey, videoBuffer, "video/mp4");

  const durationSeconds = (await probeVideoDuration(videoBuffer)) ?? result.durationSeconds;

  let filmstripUrl: string | undefined;
  let filmstripTiles: number | undefined;
  try {
    const strip = await generateFilmstripJpeg(videoBuffer, durationSeconds);
    filmstripUrl = storageKey.replace(/\.mp4$/i, "") + "-filmstrip.jpg";
    filmstripTiles = strip.tiles;
    await uploadFile(filmstripUrl, strip.jpeg, "image/jpeg");
  } catch (err) {
    console.warn("Filmstrip generation failed", { sessionId, storageKey, err });
  }

  const [session] = await db.select({ userId: filmSessions.userId }).from(filmSessions).where(eq(filmSessions.id, sessionId));
  const [mediaRow] = await db.insert(media).values({
    userId: session.userId,
    type: "video",
    url: storageKey,
    prompt: args.prompt,
    modelUsed: "seedance-2-mini",
    metadata: {
      duration: durationSeconds,
      ...(filmstripUrl ? { filmstripUrl, filmstripTiles } : {}),
    },
  }).returning({ id: media.id });

  return {
    url: await mediaUrl(storageKey),
    durationSeconds,
    mediaId: mediaRow.id,
    filmstripUrl,
    filmstripTiles,
  };
}
