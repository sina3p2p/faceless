import { tool } from "ai";
import { z } from "zod";

const SKIP_REASONS = [
  "insert_only_scene",
  "lone_establishing_scene",
  "environment_no_grid_tooling",
  "grid_generation_failed",
] as const;

const ANCHOR_KINDS = ["prior_grid_terminal_panel", "prior_render_last_frame"] as const;

/** Loose input schema for the tool (JSON-schema friendly). Strict checks run in execute. */
const inputSchema = z.object({
  scene_id: z.number().int().positive(),
  generation_id: z.string().min(1),
  shot_ids: z.array(z.number().int().positive()).min(1).max(4),
  estimated_duration_seconds: z.number().min(4).max(15),
  status: z.enum(["approved_grid", "skip_recorded"]),
  grid_handle: z.string().nullable(),
  approved_candidate_id: z.string().nullable(),
  skip_reason: z.enum(SKIP_REASONS).nullable(),
  panel_map: z.record(z.string(), z.number().int().positive().nullable()),
  continuity_pack_handle: z
    .string()
    .nullable()
    .describe(
      "Approved @sceneN_continuity handle from recordContinuityPackEntry. Required for approved_grid."
    ),
  is_first_in_scene: z
    .boolean()
    .describe(
      "True ONLY for the first generation grid in this scene. False for every later generation."
    ),
  previous_generation_id: z
    .string()
    .nullable()
    .describe(
      "Prior generation_id in this scene (e.g. '3A'). Required when is_first_in_scene=false unless continuity_break_reason is set. Null when first or breaking."
    ),
  incoming_anchor_handle: z
    .string()
    .nullable()
    .describe(
      "Visual anchor for cut-in continuity: prior generation grid handle (terminal panel) or prior render last-frame handle/URL. Required when previous_generation_id is set."
    ),
  incoming_anchor_kind: z
    .enum(ANCHOR_KINDS)
    .nullable()
    .describe(
      "prior_grid_terminal_panel during Stage 1 / before video; prior_render_last_frame once the previous generation's clip is approved."
    ),
  incoming_anchor_panel: z
    .number()
    .int()
    .positive()
    .nullable()
    .describe(
      "Panel number of the prior grid's terminal panel when incoming_anchor_kind is prior_grid_terminal_panel; null for last-frame anchors."
    ),
  continuity_break_reason: z
    .string()
    .nullable()
    .describe(
      "If set, this generation intentionally does NOT continue the prior generation (hard cut / time jump / new axis). Omit previous_generation_id and incoming_anchor_* when set. Not allowed when is_first_in_scene=true."
    ),
});

export type GenerationGridRegistryEntry = z.infer<typeof inputSchema>;

/** Shared continuity-chain rules for registry + generate tool. */
export function validateContinuityChain(fields: {
  status?: string;
  is_first_in_scene?: boolean | null;
  previous_generation_id: string | null | undefined;
  incoming_anchor_handle: string | null | undefined;
  incoming_anchor_kind: string | null | undefined;
  incoming_anchor_panel: number | null | undefined;
  continuity_break_reason: string | null | undefined;
  requireForApproved?: boolean;
}): string[] {
  const errors: string[] = [];
  const isFirst = fields.is_first_in_scene === true;
  const isLater = fields.is_first_in_scene === false;
  const prev = fields.previous_generation_id ?? null;
  const anchor = fields.incoming_anchor_handle ?? null;
  const kind = fields.incoming_anchor_kind ?? null;
  const panel = fields.incoming_anchor_panel ?? null;
  const breakReason = fields.continuity_break_reason?.trim() || null;
  const enforce = fields.requireForApproved !== false;

  if (!enforce) return errors;

  if (fields.is_first_in_scene == null) {
    errors.push("is_first_in_scene is required (true for first generation in scene, false otherwise)");
    return errors;
  }

  if (isFirst) {
    if (prev != null || anchor != null || kind != null || panel != null) {
      errors.push("first generation in scene must not set previous_generation_id or incoming_anchor_*");
    }
    if (breakReason) {
      errors.push("first generation in scene must not set continuity_break_reason");
    }
    return errors;
  }

  // Later generation
  if (breakReason) {
    if (prev != null) {
      errors.push("continuity_break_reason must not set previous_generation_id (break resets the chain)");
    }
    if (anchor != null || kind != null || panel != null) {
      errors.push("continuity_break_reason must not set incoming_anchor_* fields");
    }
    return errors;
  }

  if (!prev) {
    errors.push(
      "later generation requires previous_generation_id + incoming_anchor_handle, or continuity_break_reason"
    );
  }
  if (!anchor) {
    errors.push("later generation requires incoming_anchor_handle (prior terminal panel or last frame)");
  }
  if (!kind) {
    errors.push("incoming_anchor_kind is required for continuous later generations");
  }
  if (kind === "prior_grid_terminal_panel" && (panel == null || panel < 1)) {
    errors.push("incoming_anchor_panel is required for prior_grid_terminal_panel");
  }
  if (kind === "prior_render_last_frame" && panel != null) {
    errors.push("incoming_anchor_panel must be null for prior_render_last_frame");
  }

  // silence unused when somehow neither
  void isLater;

  return errors;
}

function validateEntry(entry: GenerationGridRegistryEntry): string[] {
  const errors: string[] = [];

  if (entry.status === "approved_grid") {
    if (!entry.grid_handle) errors.push("approved_grid requires grid_handle");
    if (!entry.approved_candidate_id) errors.push("approved_grid requires approved_candidate_id");
    if (entry.skip_reason != null) errors.push("approved_grid must not set skip_reason");
    if (!entry.continuity_pack_handle) {
      errors.push("approved_grid requires continuity_pack_handle from an approved continuity pack");
    }
    errors.push(
      ...validateContinuityChain({
        ...entry,
        requireForApproved: true,
      })
    );
  }
  if (entry.status === "skip_recorded") {
    if (!entry.skip_reason) errors.push("skip_recorded requires skip_reason");
    if (entry.grid_handle != null) errors.push("skip_recorded must not set grid_handle");
  }

  if (entry.shot_ids.length > 4) {
    errors.push("shot_ids must have at most 4 shots (one generation window)");
  }
  if (entry.estimated_duration_seconds > 15) {
    errors.push("estimated_duration_seconds must be ≤15");
  }
  if (entry.estimated_duration_seconds < 4 && entry.status === "approved_grid") {
    errors.push("estimated_duration_seconds must be ≥4 for approved grids");
  }

  for (const id of entry.shot_ids) {
    if (!(String(id) in entry.panel_map)) {
      errors.push(`panel_map missing shot_ids entry ${id}`);
    }
  }
  for (const key of Object.keys(entry.panel_map)) {
    if (!entry.shot_ids.includes(Number(key))) {
      errors.push(`panel_map has shot ${key} not in shot_ids`);
    }
  }

  const panels = entry.shot_ids
    .map((id) => entry.panel_map[String(id)])
    .filter((p): p is number => p != null);
  const unique = new Set(panels);
  if (unique.size !== panels.length) {
    errors.push("panel_map panel numbers must be unique within the generation");
  }
  if (entry.status === "approved_grid" && panels.length !== entry.shot_ids.length) {
    errors.push("approved_grid requires a non-null panel for every shot_id");
  }

  return errors;
}

export const recordGenerationGridEntry = tool({
  description:
    "Record ONE generation-grid registry entry after grid approval or an explicit skip (Stage 1 Step 16). " +
    "One entry = one Seedance generation (1–4 shots, estimated Dur ≤15s). A scene may have many entries. " +
    "Requires continuity_pack_handle. Later generations in a scene MUST set previous_generation_id + " +
    "incoming_anchor_handle (prior terminal panel, later prior last frame) unless continuity_break_reason " +
    "documents an intentional break. Stage 1 is incomplete until every shot is covered by exactly one " +
    "passing entry. Stage 2 preflight reads these validated entries.",
  inputSchema,
  execute: async (entry) => {
    const errors = validateEntry(entry);
    if (errors.length > 0) {
      return {
        type: "text" as const,
        value: JSON.stringify({ ok: false, errors }),
      };
    }
    return {
      type: "text" as const,
      value: JSON.stringify({ ok: true, entry }),
    };
  },
});
