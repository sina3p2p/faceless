import { tool } from "ai";
import { z } from "zod";
import { generateImage } from "@/server/services/media";
import {
  validateContinuityChain,
  validateLightingState,
  validateSceneAnchor,
} from "./record-generation-grid-entry";
import { candidateKey } from "@/server/services/showrunner/handle-resolver";

const GRID_CANDIDATE_COUNT = 1;
const MIN_PANELS = 4;
const MAX_PANELS = 9;

const panelCaptionSchema = z.object({
  motionArc: z
    .string()
    .describe(
      "What this panel locks: Panel 1 = cut-in state; middle = one action/camera milestone; last = cut-out end state."
    ),
  handoff: z
    .string()
    .describe(
      "Bridge into the next panel (or, on the last panel, into the next shot's cut-in). Empty string only if truly terminal."
    ),
});

export type PanelCaptionInput = z.infer<typeof panelCaptionSchema>;

const generateGenerationGridInputSchema = z.object({
  sceneId: z.union([z.string(), z.number()]).describe("Scene id/number this shot belongs to, e.g. 3"),
  generationId: z
    .string()
    .describe(
      "Stable id for this generation within the scene, e.g. '3A' or '3-1'. One motion sheet = one shot = one Seedance render."
    ),
  shotIds: z
    .array(z.number().int().positive())
    .length(1)
    .describe("Exactly one shot number — one motion sheet covers one uninterrupted shot."),
  estimatedDurationSeconds: z
    .number()
    .min(4)
    .max(15)
    .describe(
      "This shot's estimated Dur (4–15). Prefer 8–12 for stability. Becomes the Seedance API duration."
    ),
  previousGenerationId: z
    .string()
    .nullable()
    .describe(
      "Prior generationId in this scene. Required when isFirstInScene=false unless continuityBreakReason or matchCutSource_* is set."
    ),
  isFirstInScene: z
    .boolean()
    .describe("True ONLY for the first motion sheet in this scene; false for every later one."),
  sceneAnchorHandle: z
    .string()
    .nullable()
    .describe(
      "The scene's FIRST approved motion-sheet handle. Required when isFirstInScene=false (including breaks). Null on the first sheet."
    ),
  incomingAnchorHandle: z
    .string()
    .nullable()
    .describe(
      "Prior motion sheet handle (terminal panel) or prior render last-frame handle. Required when previousGenerationId is set — list that handle in referenceHandles."
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
    .describe(
      "Prior sheet's last panel number (Pn) when kind is prior_grid_terminal_panel — Panel 1 of this sheet inherits that state."
    ),
  continuityBreakReason: z
    .string()
    .nullable()
    .describe(
      "Intentional continuity break (hard cut / time jump / new axis). When set, omit previousGenerationId and incomingAnchor_*. Scene anchor still required. May pair with matchCutSource_* for a declared twin."
    ),
  matchCutSourceGenerationId: z
    .string()
    .nullable()
    .describe(
      "Match-cut twin generationId (compositional lock across a break / lighting change). Omit previousGenerationId and incomingAnchor_*. Allowed on first-in-scene for cross-scene twins."
    ),
  matchCutSourceHandle: z
    .string()
    .nullable()
    .describe(
      "Match-cut source sheet handle. Required with matchCutSourceGenerationId — list that handle in referenceHandles."
    ),
  lightingState: z
    .string()
    .describe(
      "Exactly ONE canonical Bible lighting state for this sheet. In-shot transitions require lightingTransitionException=true."
    ),
  lightingTransitionException: z
    .boolean()
    .nullable()
    .describe(
      "True ONLY when the locked row's point IS a lighting transition. Default false/null."
    ),
  lightingTransitionReason: z
    .string()
    .nullable()
    .describe(
      "Required when lightingTransitionException=true — cite the locked row / Bible §3D."
    ),
  imagePrompt: z
    .string()
    .describe(
      "Full motion-sheet image prompt per references/generation-grids.md. Honor the scene header's continuity block. " +
      "For later sheets bind the scene anchor (first approved sheet) and the incoming anchor (prior terminal panel / last frame) " +
      "unless continuityBreakReason is set (scene anchor still binds). Include interpolate / continuous-take / no-cuts language."
    ),
  referenceHandles: z
    .array(z.string())
    .default([])
    .describe(
      "Approved named handles in order: characters → objects → location plate → scene anchor (later sheets) → " +
      "incoming anchor (mandatory for continuous later sheets). The app resolves handles to pixels — do NOT pass URLs."
    ),
  /** @deprecated Legacy alias — prefer referenceHandles. Accepted so old stored args still replay. */
  referenceImageUrls: z
    .array(z.string())
    .optional()
    .describe("Legacy: resolved URLs. Prefer referenceHandles; app ignores URLs when handles are present."),
  panelCount: z
    .number()
    .int()
    .min(MIN_PANELS)
    .max(MAX_PANELS)
    .describe(
      "Number of temporal panels (4–9). Must equal panelCaptions.length. Prefer fewer when the arc is simple."
    ),
  panelCaptions: z
    .array(panelCaptionSchema)
    .min(MIN_PANELS)
    .max(MAX_PANELS)
    .describe(
      "One caption per panel, in reading order (L→R, T→B). Length MUST equal panelCount. Shown under the sheet as a caption strip."
    ),
});

export type GenerateGenerationGridInput = z.infer<typeof generateGenerationGridInputSchema>;

/** Returns an error message when caption/panel/shot counts disagree; otherwise null. */
export function validatePanelCaptionCount(
  panelCount: number | undefined,
  panelCaptions: PanelCaptionInput[] | undefined,
  shotIds?: number[]
): string | null {
  if (
    panelCount == null ||
    !Number.isInteger(panelCount) ||
    panelCount < MIN_PANELS ||
    panelCount > MAX_PANELS
  ) {
    return `panelCount is required and must be an integer from ${MIN_PANELS} to ${MAX_PANELS}`;
  }
  if (!panelCaptions || panelCaptions.length === 0) {
    return "panelCaptions is required — one motionArc + handoff per panel";
  }
  if (panelCaptions.length !== panelCount) {
    return `panelCaptions length (${panelCaptions.length}) must equal panelCount (${panelCount})`;
  }
  if (shotIds) {
    if (shotIds.length !== 1) {
      return "shotIds must contain exactly one shot (one motion sheet = one uninterrupted shot)";
    }
  }
  return null;
}

/** Effective reference list: prefer handles; fall back to legacy URLs for replay. */
export function effectiveGridRefs(args: {
  referenceHandles?: string[] | null;
  referenceImageUrls?: string[] | null;
}): string[] {
  if (args.referenceHandles && args.referenceHandles.length > 0) {
    return args.referenceHandles;
  }
  return args.referenceImageUrls ?? [];
}

/** Validate continuity chain + scene-anchor + lighting fields on generateGenerationGrid args. */
export function validateGenerationGridContinuity(args: {
  isFirstInScene?: boolean | null;
  sceneAnchorHandle?: string | null;
  previousGenerationId?: string | null;
  incomingAnchorHandle?: string | null;
  incomingAnchorKind?: string | null;
  incomingAnchorPanel?: number | null;
  continuityBreakReason?: string | null;
  matchCutSourceGenerationId?: string | null;
  matchCutSourceHandle?: string | null;
  lightingState?: string | null;
  lightingTransitionException?: boolean | null;
  lightingTransitionReason?: string | null;
  referenceHandles?: string[];
  /** @deprecated legacy alias */
  referenceImageUrls?: string[];
}): string | null {
  const sceneErrors = validateSceneAnchor({
    is_first_in_scene: args.isFirstInScene,
    scene_anchor_handle: args.sceneAnchorHandle ?? null,
    requireForApproved: true,
  });
  if (sceneErrors.length > 0) return sceneErrors.join("; ");

  const chainErrors = validateContinuityChain({
    is_first_in_scene: args.isFirstInScene,
    previous_generation_id: args.previousGenerationId ?? null,
    incoming_anchor_handle: args.incomingAnchorHandle ?? null,
    incoming_anchor_kind: args.incomingAnchorKind ?? null,
    incoming_anchor_panel: args.incomingAnchorPanel ?? null,
    continuity_break_reason: args.continuityBreakReason ?? null,
    match_cut_source_generation_id: args.matchCutSourceGenerationId ?? null,
    match_cut_source_handle: args.matchCutSourceHandle ?? null,
    requireForApproved: true,
  });
  if (chainErrors.length > 0) return chainErrors.join("; ");

  const lightingErrors = validateLightingState({
    status: "approved_grid",
    lighting_state: args.lightingState ?? null,
    lighting_transition_exception: args.lightingTransitionException ?? null,
    lighting_transition_reason: args.lightingTransitionReason ?? null,
    requireLightingState: true,
    requireForApproved: true,
  });
  if (lightingErrors.length > 0) return lightingErrors.join("; ");

  const refs = effectiveGridRefs(args);
  const hasMatchCut = !!(
    args.matchCutSourceGenerationId?.trim() || args.matchCutSourceHandle?.trim()
  );
  const needsIncoming =
    args.isFirstInScene === false &&
    !!args.previousGenerationId &&
    !args.continuityBreakReason?.trim() &&
    !hasMatchCut;
  if (needsIncoming && refs.length === 0) {
    return "continuous later sheets require the scene anchor + incoming anchor handles in referenceHandles";
  }
  const needsSceneAnchor = args.isFirstInScene === false;
  if (needsSceneAnchor && refs.length === 0) {
    return "later sheets require the scene anchor handle in referenceHandles";
  }
  if (hasMatchCut && refs.length === 0) {
    return "match-cut sheets require the match-cut source handle in referenceHandles";
  }
  return null;
}

export const generateGenerationGrid = tool({
  description:
    "Generate a candidate motion sheet for ONE shot / Seedance generation (Stage 1 Step 10). " +
    "One motion sheet = one uninterrupted shot: 4–9 temporal panels (Panel 1 = cut-in, middle = milestones only, " +
    "Panel n = cut-out). Estimated Dur ≤15s (prefer 8–12). Never pack multiple shots onto one sheet. " +
    "Call once per shot, pre-screen the fresh image (vision), present it, wait for Approve-grid (never askQuestions), " +
    "record via recordGenerationGridEntry, then the next shot. " +
    "Scene continuity comes from the scene header's continuity block (text) plus image anchors — there is no " +
    "separate continuity-pack artifact. Later sheets MUST pass sceneAnchorHandle (first approved sheet) and either " +
    "(1) previousGenerationId + incomingAnchorHandle/Kind/Panel, (2) continuityBreakReason, or " +
    "(3) matchCutSourceGenerationId + matchCutSourceHandle for a declared twin across a break. " +
    "Pass lightingState (one canonical state); in-shot transitions need lightingTransitionException. " +
    "Pass referenceHandles (named labels like @hero_charsheet) — the app attaches pixels; do NOT pass URLs. " +
    "Always pass panelCount (4–9), panelCaptions (same length), and shotIds (exactly one shot). " +
    "If this tool returns ok:false, fix the listed errors and call again in the same turn.",
  inputSchema: generateGenerationGridInputSchema,
  execute: async (args) => {
    const error =
      validatePanelCaptionCount(args.panelCount, args.panelCaptions, args.shotIds) ??
      validateGenerationGridContinuity(args);
    if (error) {
      return {
        type: "text" as const,
        value: JSON.stringify({ ok: false, errors: [error] }),
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
  sessionId: string,
  gridHandle: string,
): Promise<string[]> {
  const storageKey = candidateKey(sessionId, gridHandle, "png");
  const results = await Promise.all(
    Array.from({ length: GRID_CANDIDATE_COUNT }, () =>
      generateImage({
        model: "gpt-image-2",
        prompt: imagePrompt,
        referenceImages: referenceImageUrls,
        aspectRatio: "16:9",
        storageKey,
      })
    )
  );
  // Return storage keys (not signed URLs) so approval can copy to the canonical key.
  return results.flat();
}
