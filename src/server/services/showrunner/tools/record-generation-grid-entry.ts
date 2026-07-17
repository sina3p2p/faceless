import { tool } from "ai";
import { z } from "zod";

const SKIP_REASONS = [
  "insert_only_scene",
  "lone_establishing_scene",
  "environment_no_grid_tooling",
  "grid_generation_failed",
] as const;

const ANCHOR_KINDS = ["prior_grid_terminal_panel", "prior_render_last_frame"] as const;

const MIN_PANELS = 4;
const MAX_PANELS = 9;

/** Loose input schema for the tool (JSON-schema friendly). Strict checks run in execute. */
const inputSchema = z.object({
  scene_id: z.number().int().positive(),
  generation_id: z.string().min(1),
  shot_ids: z.array(z.number().int().positive()).min(1),
  estimated_duration_seconds: z.number().min(4).max(15),
  status: z.enum(["approved_grid", "skip_recorded"]),
  grid_handle: z.string().nullable(),
  approved_candidate_id: z.string().nullable(),
  skip_reason: z.enum(SKIP_REASONS).nullable(),
  panel_map: z.record(z.string(), z.number().int().positive().nullable()),
  panel_count: z
    .number()
    .int()
    .min(MIN_PANELS)
    .max(MAX_PANELS)
    .nullable()
    .describe(
      "Temporal panel count on the motion sheet (4–9). Required for approved_grid; null for skips."
    ),
  scene_anchor_handle: z
    .string()
    .nullable()
    .describe(
      "The scene's FIRST approved motion-sheet handle (e.g. @scene3_gen3A_grid). " +
        "Required for later generations in the scene (including continuity breaks). Null when is_first_in_scene=true."
    ),
  is_first_in_scene: z
    .boolean()
    .describe(
      "True ONLY for the first motion sheet in this scene. False for every later generation."
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
      "Visual anchor for cut-in continuity: prior motion sheet handle (terminal panel) or prior render last-frame handle/URL. Required when previous_generation_id is set."
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
      "Panel number of the prior sheet's terminal panel (Pn) when incoming_anchor_kind is prior_grid_terminal_panel; null for last-frame anchors."
    ),
  continuity_break_reason: z
    .string()
    .nullable()
    .describe(
      "If set, this generation intentionally does NOT continue the prior generation (hard cut / time jump / new axis). Omit previous_generation_id and incoming_anchor_* when set. Not allowed when is_first_in_scene=true. Scene anchor still required."
    ),
});

export type GenerationGridRegistryEntry = z.infer<typeof inputSchema>;

/** Scene-anchor rules: first sheet IS the anchor; later sheets must cite it. */
export function validateSceneAnchor(fields: {
  is_first_in_scene?: boolean | null;
  scene_anchor_handle: string | null | undefined;
  requireForApproved?: boolean;
}): string[] {
  const errors: string[] = [];
  if (fields.requireForApproved === false) return errors;
  if (fields.is_first_in_scene == null) return errors;

  const handle = fields.scene_anchor_handle?.trim() || null;
  if (fields.is_first_in_scene === true) {
    if (handle) {
      errors.push("first generation in scene must not set scene_anchor_handle (it IS the scene anchor)");
    }
  } else if (!handle) {
    errors.push(
      "later generation requires scene_anchor_handle (the scene's first approved motion-sheet handle)"
    );
  }
  return errors;
}

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
  if (kind === "prior_grid_terminal_panel") {
    if (panel == null || panel < MIN_PANELS || panel > MAX_PANELS) {
      errors.push(
        `incoming_anchor_panel must be the prior sheet's last panel (${MIN_PANELS}–${MAX_PANELS}) for prior_grid_terminal_panel`
      );
    }
  }
  if (kind === "prior_render_last_frame" && panel != null) {
    errors.push("incoming_anchor_panel must be null for prior_render_last_frame");
  }

  return errors;
}

function validateEntry(entry: GenerationGridRegistryEntry): string[] {
  const errors: string[] = [];

  if (entry.status === "approved_grid") {
    if (!entry.grid_handle) errors.push("approved_grid requires grid_handle");
    if (!entry.approved_candidate_id) errors.push("approved_grid requires approved_candidate_id");
    if (entry.skip_reason != null) errors.push("approved_grid must not set skip_reason");
    if (entry.shot_ids.length !== 1) {
      errors.push("approved_grid requires exactly one shot_id (one motion sheet = one shot)");
    }
    if (
      entry.panel_count == null ||
      !Number.isInteger(entry.panel_count) ||
      entry.panel_count < MIN_PANELS ||
      entry.panel_count > MAX_PANELS
    ) {
      errors.push(`approved_grid requires panel_count from ${MIN_PANELS} to ${MAX_PANELS}`);
    }
    errors.push(
      ...validateSceneAnchor({
        is_first_in_scene: entry.is_first_in_scene,
        scene_anchor_handle: entry.scene_anchor_handle,
        requireForApproved: true,
      })
    );
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
    if (entry.panel_count != null) errors.push("skip_recorded must not set panel_count");
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
  if (entry.status === "approved_grid") {
    if (panels.length !== entry.shot_ids.length) {
      errors.push("approved_grid requires a non-null panel for every shot_id");
    }
    // Cut-in index on the sheet is always panel 1
    for (const p of panels) {
      if (p !== 1) {
        errors.push("approved_grid panel_map must map the shot to cut-in panel 1");
      }
    }
  }

  return errors;
}

export const recordGenerationGridEntry = tool({
  description:
    "Record ONE motion-sheet registry entry after approval or an explicit skip (Stage 1 Step 10). " +
    "One approved entry = one shot = one Seedance generation (4–9 temporal panels, estimated Dur ≤15s). " +
    "Requires panel_count for approved_grid. Later sheets MUST set scene_anchor_handle (the scene's first " +
    "approved sheet) plus previous_generation_id + incoming_anchor_handle (prior terminal panel Pn, later " +
    "prior last frame) unless continuity_break_reason documents an intentional break (scene anchor still " +
    "required on breaks). Stage 1 is incomplete until every shot is covered by exactly one passing entry. " +
    "Stage 2 preflight reads these validated entries.",
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
