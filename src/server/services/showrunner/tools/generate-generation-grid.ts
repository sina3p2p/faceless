import { tool } from "ai";
import { z } from "zod";
import { generateImage } from "@/server/services/media";
import { validateContinuityChain } from "./record-generation-grid-entry";
import { mediaUrl } from "@/lib/storage";

const GRID_CANDIDATE_COUNT = 1;

const panelCaptionSchema = z.object({
  motionArc: z
    .string()
    .describe("Motion arc for this panel from the shot row (what moves / changes in the cut-in moment)."),
  handoff: z
    .string()
    .describe("Handoff into the next panel / shot (eyeline, exit, match cut, or end-of-generation)."),
});

export type PanelCaptionInput = z.infer<typeof panelCaptionSchema>;

const generateGenerationGridInputSchema = z.object({
  sceneId: z.union([z.string(), z.number()]).describe("Scene id/number this generation belongs to, e.g. 3"),
  generationId: z
    .string()
    .describe(
      "Stable id for this generation within the scene, e.g. '3A' or '3-1'. One generation grid = one Seedance render."
    ),
  shotIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(4)
    .describe("1–4 consecutive shot numbers this generation will render, in order."),
  estimatedDurationSeconds: z
    .number()
    .min(4)
    .max(15)
    .describe(
      "Sum of this generation's estimated Dur values (4–15). Prefer 8–12 for stability. Becomes the Seedance API duration."
    ),
  previousGenerationId: z
    .string()
    .nullable()
    .describe(
      "Prior generationId in this scene. Required when isFirstInScene=false unless continuityBreakReason is set."
    ),
  isFirstInScene: z
    .boolean()
    .describe("True ONLY for the first generation grid in this scene; false for every later one."),
  incomingAnchorHandle: z
    .string()
    .nullable()
    .describe(
      "Prior generation grid handle (terminal panel) or prior render last-frame URL/handle. Required when previousGenerationId is set — attach its image in referenceImageUrls."
    ),
  incomingAnchorKind: z
    .enum(["prior_grid_terminal_panel", "prior_render_last_frame"])
    .nullable()
    .describe(
      "prior_grid_terminal_panel before video exists; prior_render_last_frame once the previous clip is approved."
    ),
  incomingAnchorPanel: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe("Terminal panel number on the prior grid when kind is prior_grid_terminal_panel."),
  continuityBreakReason: z
    .string()
    .nullable()
    .describe(
      "Intentional continuity break (hard cut / time jump / new axis). When set, omit previousGenerationId and incomingAnchor_*."
    ),
  imagePrompt: z
    .string()
    .describe(
      "Full generation-grid image prompt per references/generation-grids.md. Must bind continuity pack keyframes; for later generations also bind the incoming anchor (prior terminal panel / last frame) unless continuityBreakReason is set."
    ),
  referenceImageUrls: z
    .array(z.string())
    .describe(
      "Approved refs in order: characters → objects → location → continuity pack keyframes (1–3) → incoming anchor image (mandatory for continuous later generations)."
    ),
  panelCount: z
    .number()
    .int()
    .min(1)
    .max(4)
    .describe("Number of panels (1–4). Must equal shotIds.length and panelCaptions.length."),
  panelCaptions: z
    .array(panelCaptionSchema)
    .min(1)
    .max(4)
    .describe(
      "One caption per panel, in panel order. Length MUST equal panelCount. Shown under the grid as a caption strip."
    ),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1"])
    .default("16:9")
    .describe("The film's LOCKED aspect ratio from the Look — panels must render in the film's true ratio."),
});

export type GenerateGenerationGridInput = z.infer<typeof generateGenerationGridInputSchema>;

/** Returns an error message when caption/panel/shot counts disagree; otherwise null. */
export function validatePanelCaptionCount(
  panelCount: number | undefined,
  panelCaptions: PanelCaptionInput[] | undefined,
  shotIds?: number[]
): string | null {
  if (panelCount == null || !Number.isInteger(panelCount) || panelCount < 1 || panelCount > 4) {
    return "panelCount is required and must be an integer from 1 to 4";
  }
  if (!panelCaptions || panelCaptions.length === 0) {
    return "panelCaptions is required — one motionArc + handoff per panel";
  }
  if (panelCaptions.length !== panelCount) {
    return `panelCaptions length (${panelCaptions.length}) must equal panelCount (${panelCount})`;
  }
  if (shotIds && shotIds.length !== panelCount) {
    return `shotIds length (${shotIds.length}) must equal panelCount (${panelCount})`;
  }
  return null;
}

/** Validate continuity chain fields on generateGenerationGrid args. */
export function validateGenerationGridContinuity(args: {
  isFirstInScene?: boolean | null;
  previousGenerationId?: string | null;
  incomingAnchorHandle?: string | null;
  incomingAnchorKind?: string | null;
  incomingAnchorPanel?: number | null;
  continuityBreakReason?: string | null;
  referenceImageUrls?: string[];
}): string | null {
  const chainErrors = validateContinuityChain({
    is_first_in_scene: args.isFirstInScene,
    previous_generation_id: args.previousGenerationId ?? null,
    incoming_anchor_handle: args.incomingAnchorHandle ?? null,
    incoming_anchor_kind: args.incomingAnchorKind ?? null,
    incoming_anchor_panel: args.incomingAnchorPanel ?? null,
    continuity_break_reason: args.continuityBreakReason ?? null,
    requireForApproved: true,
  });
  if (chainErrors.length > 0) return chainErrors.join("; ");

  const needsAnchor =
    args.isFirstInScene === false &&
    !!args.previousGenerationId &&
    !args.continuityBreakReason?.trim();
  if (needsAnchor && (args.referenceImageUrls?.length ?? 0) === 0) {
    return "continuous later generations require the incoming anchor image in referenceImageUrls (plus continuity pack keyframes)";
  }
  return null;
}

export const generateGenerationGrid = tool({
  description:
    "Generate a candidate generation-grid storyboard for ONE Seedance generation (Stage 1 Step 16). " +
    "One generation grid = one video render: 1–4 consecutive shots whose estimated Dur sum is ≤15s " +
    "(prefer 8–12). Never build a scene-sized grid and partition later. Call once per generation, " +
    "present it, wait for approval, record via recordGenerationGridEntry, then the next generation. " +
    "Requires an approved scene continuity pack. Later generations in the same scene MUST pass " +
    "previousGenerationId + incomingAnchorHandle/Kind (prior terminal panel; later prior last frame) " +
    "and attach that image in referenceImageUrls — unless continuityBreakReason documents an intentional break. " +
    "Always pass panelCount, panelCaptions, and shotIds with matching lengths. " +
    "If this tool returns ok:false, fix the listed continuity/panel errors and call again in the same turn.",
  inputSchema: generateGenerationGridInputSchema,
  execute: async (args) => {
    const captionError = validatePanelCaptionCount(
      args.panelCount,
      args.panelCaptions,
      args.shotIds
    );
    if (captionError) {
      return {
        type: "text" as const,
        value: JSON.stringify({ ok: false, errors: [captionError] }),
      };
    }
    const continuityError = validateGenerationGridContinuity({
      isFirstInScene: args.isFirstInScene,
      previousGenerationId: args.previousGenerationId,
      incomingAnchorHandle: args.incomingAnchorHandle,
      incomingAnchorKind: args.incomingAnchorKind,
      incomingAnchorPanel: args.incomingAnchorPanel,
      continuityBreakReason: args.continuityBreakReason,
      referenceImageUrls: args.referenceImageUrls,
    });
    if (continuityError) {
      return {
        type: "text" as const,
        value: JSON.stringify({
          ok: false,
          errors: continuityError.split("; ").filter(Boolean),
        }),
      };
    }
    return {
      type: "text" as const,
      value: JSON.stringify({
        ok: true,
        status: "pending_generation",
        message:
          "Args accepted. Images will be generated and shown for user approval. " +
          "Do not call recordGenerationGridEntry until the user approves a candidate.",
      }),
    };
  },
});

/** Shared by the chat route (first generation) and the retry-tool route (regeneration). */
export async function generateGenerationGridImages(
  imagePrompt: string,
  referenceImageUrls: string[],
  aspectRatio: "16:9" | "9:16" | "1:1"
): Promise<string[]> {
  const results = await Promise.all(
    Array.from({ length: GRID_CANDIDATE_COUNT }, () =>
      generateImage({
        model: "gpt-image-2",
        prompt: imagePrompt,
        referenceImages: referenceImageUrls,
        aspectRatio
      })
    )
  );
  return Promise.all(results.flat().map((img) => mediaUrl(img)));
}
