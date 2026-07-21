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

const referenceSlotSchema = z.object({
  slot: z.string().describe('Seedance slot label, e.g. "Image1" or "Audio1"'),
  handle: z.string().describe('Bound @material or grid handle, e.g. "@hero_charsheet" or "@hero_vo"'),
  kind: z
    .string()
    .describe(
      "character | object | location | scene_anchor | incoming_anchor | match_cut_source | grid | voice"
    ),
  controls: z.string().describe("What this reference governs"),
});

const audioReferenceSlotSchema = z.object({
  slot: z.string().describe('Seedance audio slot, e.g. "Audio1"'),
  handle: z.string().describe('Approved voice handle, e.g. "@hero_vo"'),
  kind: z.literal("voice").describe("Always voice for audio references"),
  controls: z
    .string()
    .describe("What this audio governs — typically timbre / speaker identity for lip-synced dialogue"),
});

/**
 * Recipe render package (shot-compilation-recipe.md). The model emits this
 * structured object; the app maps it onto Seedance API params — resolving
 * named handles to pixels itself (do NOT pass URLs).
 */
const compileShotInputSchema = z.object({
  status: z
    .enum(["ok", "gap"])
    .describe('"ok" to present for review; "gap" when Bible+row cannot compile — name gaps, no prompt'),
  shot_id: z.string().describe("Shot id being compiled, e.g. \"14\""),
  generation_shot_ids: z
    .array(z.string())
    .length(1)
    .describe("Exactly one shot — one compile = one motion sheet = one shot"),
  grid_reference: z
    .string()
    .nullable()
    .describe("Motion-sheet handle e.g. @scene3_gen3A_grid, or null for skip_recorded shots"),
  continuity_mode: z
    .enum(CONTINUITY_MODES)
    .describe(
      "fresh = stills-only (scene open / clean break / new take). " +
      "extend_video = continue from previous approved clip (walks / continuous action)."
    ),
  source_clip_handle: z
    .string()
    .nullable()
    .describe(
      "Required for extend_video: prior approved clip handle e.g. @shot13_clip. Null for fresh. " +
      "The app resolves the handle — do NOT pass a URL."
    ),
  /** @deprecated Prefer source_clip_handle. Accepted for legacy stored args. */
  source_video_url: z
    .string()
    .nullable()
    .optional()
    .describe("Legacy URL for extend_video. Prefer source_clip_handle."),
  render_prompt: z
    .string()
    .nullable()
    .describe(
      "Full Seedance 2.0 prompt when status=ok; null when status=gap. " +
      "For extend_video, open with Extend <Video_1>: … (never say 'reference <Video_1>'). " +
      "When continuing across clips, CONTEXT must restate footing from the previous last frame."
    ),
  duration_seconds: z
    .number()
    .int()
    .min(4)
    .max(15)
    .nullable()
    .describe("Registry estimate (4–15). Null when status=gap. API duration param — never prompt text."),
  resolution: z
    .string()
    .default("1080p")
    .describe("Structured API field only — never words inside render_prompt."),
  references: z
      .array(referenceSlotSchema)
      .max(9)
      .default([])
      .describe(
        "Image slot metadata in precision order: character → object → location → scene anchor → " +
        "incoming anchor → motion sheet. Named handles only — the app attaches pixels."
      ),
  /** @deprecated Prefer references[].handle. Kept so legacy stored args still replay. */
  reference_image_urls: z
    .array(z.string())
    .max(9)
    .optional()
    .describe("Legacy resolved URLs. Prefer references[].handle; app resolves handles itself."),
  audio_references: z
    .array(audioReferenceSlotSchema)
    .max(3)
    .default([])
    .describe(
      "Voice slots for dialogue shots. Named handles only — the app attaches audio. " +
      "Attach approved @*_vo handles for every on-screen / VO speaker in the shot."
    ),
  /** @deprecated Prefer audio_references[].handle. */
  reference_audio_urls: z
    .array(z.string())
    .max(3)
    .optional()
    .describe("Legacy resolved audio URLs. Prefer audio_references[].handle."),
  checks: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Self-verified assertion checks from the recipe before emitting"),
  gaps: z
    .array(z.string())
    .default([])
    .describe("Named gaps when status=gap; empty when status=ok"),
});

export type CompileShotToolInput = z.infer<typeof compileShotInputSchema>;

/** Normalized args used by the render worker / Seedance dispatch. */
export type CompileShotArgs = {
  prompt: string;
  referenceImageUrls: string[];
  referenceAudioUrls?: string[];
  duration: number;
  aspectRatio: "16:9" | "9:16" | "1:1";
  continuityMode?: ContinuityMode;
  sourceVideoUrl?: string;
  resolution?: string;
};

/** Map recipe package (or legacy camelCase args) onto render worker fields. */
export function toCompileShotArgs(
  args: CompileShotToolInput | Record<string, unknown>
): CompileShotArgs | null {
  const a = args as Record<string, unknown>;
  const status = (a.status as string | undefined) ?? "ok";
  if (status === "gap") return null;

  const prompt =
    (a.render_prompt as string | null | undefined) ??
    (a.prompt as string | undefined);
  if (!prompt?.trim()) return null;

  // Prefer server-resolved keys patched onto the tool-call args after handle resolution.
  const refs =
    (a.resolvedReferenceUrls as string[] | undefined) ??
    (a.reference_image_urls as string[] | undefined) ??
    (a.referenceImageUrls as string[] | undefined) ??
    [];

  const audioRefs =
    (a.resolvedAudioUrls as string[] | undefined) ??
    (a.reference_audio_urls as string[] | undefined) ??
    (a.referenceAudioUrls as string[] | undefined) ??
    [];

  const duration =
    (a.duration_seconds as number | null | undefined) ??
    (a.duration as number | undefined);
  if (duration == null) return null;

  const continuityMode = ((a.continuity_mode as ContinuityMode | undefined) ??
    (a.continuityMode as ContinuityMode | undefined) ??
    "fresh") as ContinuityMode;

  const sourceVideoUrl =
    (a.resolvedSourceVideoUrl as string | null | undefined) ??
    (a.source_video_url as string | null | undefined) ??
    (a.sourceVideoUrl as string | undefined) ??
    undefined;

  return {
    prompt,
    referenceImageUrls: refs,
    referenceAudioUrls: audioRefs,
    duration,
    aspectRatio: "16:9",
    continuityMode,
    sourceVideoUrl: sourceVideoUrl || undefined,
    resolution: (a.resolution as string | undefined) ?? "1080p",
  };
}

export function validateCompilePackage(args: CompileShotToolInput): string[] {
  const errors: string[] = [];
  if (args.status === "gap") {
    if (!args.gaps?.length) errors.push("status=gap requires at least one named gap");
    if (args.render_prompt != null) errors.push("status=gap must set render_prompt to null");
    return errors;
  }
  if (!args.render_prompt?.trim()) errors.push("status=ok requires render_prompt");
  if (args.duration_seconds == null) errors.push("status=ok requires duration_seconds");
  if (args.gaps?.length) errors.push("status=ok must not list gaps (use status=gap instead)");
  if (args.generation_shot_ids.length !== 1) {
    errors.push("generation_shot_ids must contain exactly one shot");
  }
  const continuityMode = args.continuity_mode;
  if (continuityMode === "extend_video") {
    const hasSource =
      !!(args.source_clip_handle?.trim()) ||
      !!(args.source_video_url?.trim());
    if (!hasSource) {
      errors.push("extend_video requires source_clip_handle (e.g. @shot13_clip)");
    }
  }
  if (continuityMode === "fresh") {
    const hasRefs =
      args.references.length > 0 ||
      (args.reference_image_urls?.length ?? 0) > 0;
    if (!hasRefs) {
      errors.push("fresh mode requires at least one entry in references (named handles)");
    }
  }
  return errors;
}

export const compileShot = tool({
  description:
    "Compile ONE shot into the structured render package from shot-compilation-recipe.md and " +
    "present it for user review before any rendering. Only after Stage 1 is complete (registry " +
    "passing): load stage2-skill.md and shot-compilation-recipe.md, then call this tool. " +
    "One compile = one motion sheet = one shot. Emit status=ok with the full package, or " +
    "status=gap naming missing Bible/row values (never invent). " +
    "continuity_mode extend_video requires source_clip_handle (e.g. @shot13_clip); fresh requires " +
    "references[] with named handles. The app resolves handles to pixels — do NOT pass URLs. " +
    "Slot order (images): character → object → location → scene anchor → incoming anchor → motion sheet. " +
    "Dialogue shots: list approved @*_vo handles in audio_references. " +
    "Prompt must interpolate the motion sheet (continuous take; COMPOSITION LOCK on Panel 1, " +
    "END STATE LOCK on Panel n). Wait for shot approval before compiling the next shot.",
  inputSchema: compileShotInputSchema,
  execute: async (args) => {
    const errors = validateCompilePackage(args);
    if (errors.length > 0) {
      return {
        type: "text" as const,
        value: JSON.stringify({ ok: false, errors }),
      };
    }
    if (args.status === "gap") {
      return {
        type: "text" as const,
        value: JSON.stringify({
          ok: true,
          status: "gap",
          shot_id: args.shot_id,
          gaps: args.gaps,
          message: "Gap recorded — fix upstream, then recompile. Do not present for render.",
        }),
      };
    }
    return {
      type: "text" as const,
      value: JSON.stringify({
        ok: true,
        status: "ok",
        shot_id: args.shot_id,
        message:
          "Package accepted. Shown to the user for review. Do not assume approval — wait for the Approve button.",
      }),
    };
  },
});

export function validateCompileContinuity(args: CompileShotArgs): string[] {
  const mode = args.continuityMode ?? "fresh";
  const errors: string[] = [];
  if (mode === "extend_video" && !args.sourceVideoUrl) {
    errors.push("extend_video requires sourceVideoUrl / source_clip_handle (the previous approved clip).");
  }
  if (mode === "fresh" && (!args.referenceImageUrls || args.referenceImageUrls.length === 0)) {
    errors.push("fresh mode requires at least one reference (named handle).");
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
      referenceAudios:
        args.referenceAudioUrls && args.referenceAudioUrls.length > 0
          ? args.referenceAudioUrls
          : undefined,
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
