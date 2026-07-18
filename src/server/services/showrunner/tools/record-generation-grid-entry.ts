import { tool } from "ai";
import { z } from "zod";
import { storageKeyFrom } from "@/lib/storage";

const SKIP_REASONS = [
  "insert_only_scene",
  "lone_establishing_scene",
  "environment_no_grid_tooling",
  "grid_generation_failed",
] as const;

const ANCHOR_KINDS = ["prior_grid_terminal_panel", "prior_render_last_frame"] as const;

const MIN_PANELS = 4;
const MAX_PANELS = 9;

/**
 * approved_candidate_id must dereference to pixels (storage key / media URL).
 * toolCallId is ephemeral and must never be stored here — see MAINTENANCE.md.
 */
export function validateApprovedCandidateId(id: string | null | undefined): string[] {
  const errors: string[] = [];
  if (id == null || !String(id).trim()) {
    errors.push("approved_grid requires approved_candidate_id (storage key or media URL)");
    return errors;
  }
  const trimmed = String(id).trim();
  if (/^call_[a-zA-Z0-9_-]+$/.test(trimmed)) {
    errors.push(
      "approved_candidate_id must be a storage key or media URL, not a toolCallId (call_…)"
    );
    return errors;
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
  ) {
    errors.push(
      "approved_candidate_id must be a storage key or media URL, not a bare toolCallId UUID"
    );
    return errors;
  }
  const key = storageKeyFrom(trimmed);
  if (!key) {
    errors.push(
      "approved_candidate_id must resolve to a storage key or app media URL (pixels), not an opaque id"
    );
    return errors;
  }
  // storageKeyFrom echoes bare strings — require path-like keys or http(s) media refs
  if (!/^https?:\/\//i.test(trimmed) && !key.includes("/")) {
    errors.push(
      "approved_candidate_id must be a path-like storage key or media URL (got a bare token)"
    );
  }
  return errors;
}

/** Normalize candidate id to a stable storage key when possible. */
export function normalizeApprovedCandidateId(id: string): string {
  return storageKeyFrom(id.trim()) ?? id.trim();
}

/**
 * generateGenerationGrid uses camelCase; the registry uses snake_case.
 * Models often re-send camelCase on record — map aliases before strict parse.
 */
const CAMEL_TO_SNAKE: Record<string, string> = {
  sceneId: "scene_id",
  generationId: "generation_id",
  shotIds: "shot_ids",
  estimatedDurationSeconds: "estimated_duration_seconds",
  gridHandle: "grid_handle",
  approvedCandidateId: "approved_candidate_id",
  skipReason: "skip_reason",
  panelCount: "panel_count",
  lightingState: "lighting_state",
  lightingTransitionException: "lighting_transition_exception",
  lightingTransitionReason: "lighting_transition_reason",
  sceneAnchorHandle: "scene_anchor_handle",
  isFirstInScene: "is_first_in_scene",
  previousGenerationId: "previous_generation_id",
  incomingAnchorHandle: "incoming_anchor_handle",
  incomingAnchorKind: "incoming_anchor_kind",
  incomingAnchorPanel: "incoming_anchor_panel",
  continuityBreakReason: "continuity_break_reason",
  matchCutSourceGenerationId: "match_cut_source_generation_id",
  matchCutSourceHandle: "match_cut_source_handle",
};

function coerceRegistryInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  for (const [camel, snake] of Object.entries(CAMEL_TO_SNAKE)) {
    if (
      (out[snake] === undefined || out[snake] === null || out[snake] === "") &&
      src[camel] !== undefined &&
      src[camel] !== null &&
      src[camel] !== ""
    ) {
      out[snake] = src[camel];
    }
  }
  return out;
}

/** Loose input schema for the tool (JSON-schema friendly). Strict checks run in execute. */
const entryFieldsSchema = z.object({
  scene_id: z.number().int().positive(),
  generation_id: z.string().min(1),
  shot_ids: z.array(z.number().int().positive()).min(1),
  estimated_duration_seconds: z.number().min(4).max(15),
  status: z.enum(["approved_grid", "skip_recorded"]),
  grid_handle: z.string().nullable(),
  approved_candidate_id: z
    .string()
    .nullable()
    .describe(
      "Storage key or media URL of the approved sheet image (from grid_approval). " +
      "NOT a toolCallId — Stage 2 resolves this to pixels."
    ),
  skip_reason: z.enum(SKIP_REASONS).nullable(),
  panel_count: z
    .number()
    .int()
    .min(MIN_PANELS)
    .max(MAX_PANELS)
    .nullable()
    .describe(
      "Temporal panel count on the motion sheet (4–9). Required for approved_grid; null for skips."
    ),
  lighting_state: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Canonical Bible lighting state for this sheet (same as generateGenerationGrid.lightingState). " +
        "Optional on record — auto-filled from the generate call when omitted. " +
        "In-shot transitions still need lighting_transition_exception=true + reason."
    ),
  lighting_transition_exception: z
    .boolean()
    .nullable()
    .optional()
    .describe(
      "True ONLY when the locked row's point IS a lighting transition (rare carve-out). " +
      "Default false/null. When true, lighting_transition_reason is required."
    ),
  lighting_transition_reason: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Why this sheet is allowed an in-shot lighting transition; must cite the locked row / Bible §3D. " +
      "Required when lighting_transition_exception=true."
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
      "Prior generation_id in this scene (e.g. '3A'). Required when is_first_in_scene=false unless " +
      "continuity_break_reason or match_cut_source_* is set. Null when first, breaking, or match-cutting."
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
      "If set, this generation intentionally does NOT continue the prior generation (hard cut / time jump / new axis). " +
      "Omit previous_generation_id and incoming_anchor_* when set. Not allowed when is_first_in_scene=true " +
      "(unless only match_cut_source_* is used for a cross-scene twin). Scene anchor still required for later gens. " +
      "May pair with match_cut_source_* for a declared compositional twin across the break."
    ),
  match_cut_source_generation_id: z
    .string()
    .nullable()
    .describe(
      "Declared match-cut twin: prior generation_id whose framing this sheet must match. " +
      "Use when composition must match but the chain is broken (e.g. lighting-state change). " +
      "Omit previous_generation_id / incoming_anchor_*. Allowed on first-in-scene for cross-scene twins."
    ),
  match_cut_source_handle: z
    .string()
    .nullable()
    .describe(
      "Motion-sheet handle (or approved image URL) of the match-cut source. Required with match_cut_source_generation_id."
    ),
});

const inputSchema = entryFieldsSchema.passthrough();

export type GenerationGridRegistryEntry = z.infer<typeof entryFieldsSchema>;

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

export function validateMatchCut(fields: {
  match_cut_source_generation_id: string | null | undefined;
  match_cut_source_handle: string | null | undefined;
}): string[] {
  const errors: string[] = [];
  const srcId = fields.match_cut_source_generation_id?.trim() || null;
  const srcHandle = fields.match_cut_source_handle?.trim() || null;
  if (!srcId && !srcHandle) return errors;
  if (!srcId || !srcHandle) {
    errors.push(
      "match_cut requires both match_cut_source_generation_id and match_cut_source_handle"
    );
  }
  return errors;
}

export function validateLightingState(fields: {
  status?: string;
  lighting_state: string | null | undefined;
  lighting_transition_exception: boolean | null | undefined;
  lighting_transition_reason: string | null | undefined;
  /** When true (generateGenerationGrid), lighting_state itself is required. Record only checks exception consistency. */
  requireLightingState?: boolean;
  requireForApproved?: boolean;
}): string[] {
  const errors: string[] = [];
  if (fields.requireForApproved === false) return errors;
  if (fields.status !== "approved_grid") return errors;

  const state = fields.lighting_state?.trim() || null;
  if (fields.requireLightingState && !state) {
    errors.push(
      "lightingState is required (exactly one canonical Bible lighting state)"
    );
  }

  const exception = fields.lighting_transition_exception === true;
  const reason = fields.lighting_transition_reason?.trim() || null;
  if (exception && !reason) {
    errors.push(
      "lighting_transition_exception=true requires lighting_transition_reason (cite locked row / Bible §3D)"
    );
  }
  if (!exception && reason) {
    errors.push(
      "lighting_transition_reason must not be set unless lighting_transition_exception=true"
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
  match_cut_source_generation_id?: string | null | undefined;
  match_cut_source_handle?: string | null | undefined;
  requireForApproved?: boolean;
}): string[] {
  const errors: string[] = [];
  const isFirst = fields.is_first_in_scene === true;
  const prev = fields.previous_generation_id ?? null;
  const anchor = fields.incoming_anchor_handle ?? null;
  const kind = fields.incoming_anchor_kind ?? null;
  const panel = fields.incoming_anchor_panel ?? null;
  const breakReason = fields.continuity_break_reason?.trim() || null;
  const matchId = fields.match_cut_source_generation_id?.trim() || null;
  const matchHandle = fields.match_cut_source_handle?.trim() || null;
  const hasMatchCut = !!(matchId || matchHandle);
  const enforce = fields.requireForApproved !== false;

  if (!enforce) return errors;

  if (fields.is_first_in_scene == null) {
    errors.push("is_first_in_scene is required (true for first generation in scene, false otherwise)");
    return errors;
  }

  errors.push(
    ...validateMatchCut({
      match_cut_source_generation_id: matchId,
      match_cut_source_handle: matchHandle,
    })
  );

  if (isFirst) {
    if (prev != null || anchor != null || kind != null || panel != null) {
      errors.push("first generation in scene must not set previous_generation_id or incoming_anchor_*");
    }
    if (breakReason) {
      errors.push("first generation in scene must not set continuity_break_reason");
    }
    // match_cut_source_* allowed on first-in-scene for cross-scene compositional twins
    return errors;
  }

  // Later generation — match-cut is a break-with-declared-source (no footing chain)
  if (hasMatchCut && matchId && matchHandle) {
    if (prev != null) {
      errors.push(
        "match_cut must not set previous_generation_id (compositional twin, not footing continuity)"
      );
    }
    if (anchor != null || kind != null || panel != null) {
      errors.push("match_cut must not set incoming_anchor_* fields");
    }
    return errors;
  }

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
      "later generation requires previous_generation_id + incoming_anchor_handle, " +
      "continuity_break_reason, or match_cut_source_*"
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
    errors.push(...validateApprovedCandidateId(entry.approved_candidate_id));
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
      ...validateLightingState({
        status: entry.status,
        lighting_state: entry.lighting_state,
        lighting_transition_exception: entry.lighting_transition_exception,
        lighting_transition_reason: entry.lighting_transition_reason,
        requireLightingState: false,
        requireForApproved: true,
      })
    );
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
    if (entry.approved_candidate_id != null) {
      errors.push("skip_recorded must not set approved_candidate_id");
    }
  }

  if (entry.estimated_duration_seconds > 15) {
    errors.push("estimated_duration_seconds must be ≤15");
  }
  if (entry.estimated_duration_seconds < 4 && entry.status === "approved_grid") {
    errors.push("estimated_duration_seconds must be ≥4 for approved grids");
  }

  return errors;
}

function normalizeEntry(entry: GenerationGridRegistryEntry): GenerationGridRegistryEntry {
  const lightingException = entry.lighting_transition_exception === true;
  return {
    ...entry,
    lighting_state: entry.lighting_state?.trim() || null,
    approved_candidate_id:
      entry.approved_candidate_id != null && String(entry.approved_candidate_id).trim()
        ? normalizeApprovedCandidateId(String(entry.approved_candidate_id))
        : entry.approved_candidate_id,
    lighting_transition_exception: lightingException ? true : false,
    lighting_transition_reason: lightingException
      ? entry.lighting_transition_reason?.trim() || null
      : null,
    match_cut_source_generation_id: entry.match_cut_source_generation_id?.trim() || null,
    match_cut_source_handle: entry.match_cut_source_handle?.trim() || null,
  };
}

export function createRecordGenerationGridEntryTool(options?: {
  /** Fallback when the model omits lighting_state — usually from generateGenerationGrid.lightingState. */
  resolveLightingState?: (generationId: string) => string | null | undefined;
}) {
  return tool({
    description:
      "Record ONE motion-sheet registry entry after approval or an explicit skip (Stage 1 Step 10). " +
      "One approved entry = one shot = one Seedance generation (4–9 temporal panels, estimated Dur ≤15s). " +
      "Requires panel_count and approved_candidate_id (storage key / media URL — NOT a toolCallId). " +
      "lighting_state is optional (auto-filled from generateGenerationGrid.lightingState when omitted). " +
      "CamelCase aliases (lightingState, panelCount, …) are accepted. In-shot lighting transitions require " +
      "lighting_transition_exception=true + reason. Later sheets MUST set scene_anchor_handle plus either " +
      "(1) previous_generation_id + incoming_anchor_* , (2) continuity_break_reason, or (3) match_cut_source_* " +
      "for a declared compositional twin across a break. Stage 1 is incomplete until every shot is covered. " +
      "Stage 2 preflight reads these validated entries.",
    inputSchema,
    execute: async (raw) => {
      const normalized = normalizeEntry(
        coerceRegistryInput(raw) as GenerationGridRegistryEntry
      );
      if (
        normalized.status === "approved_grid" &&
        !normalized.lighting_state?.trim() &&
        options?.resolveLightingState
      ) {
        const fallback = options.resolveLightingState(normalized.generation_id)?.trim();
        if (fallback) normalized.lighting_state = fallback;
      }
      const errors = validateEntry(normalized);
      if (errors.length > 0) {
        return {
          type: "text" as const,
          value: JSON.stringify({ ok: false, errors }),
        };
      }
      return {
        type: "text" as const,
        value: JSON.stringify({ ok: true, entry: normalized }),
      };
    },
  });
}

export const recordGenerationGridEntry = createRecordGenerationGridEntryTool();
