import { tool } from "ai";
import { z } from "zod";

const SKIP_REASONS = [
  "insert_only_scene",
  "lone_establishing_scene",
  "environment_no_grid_tooling",
  "grid_generation_failed",
] as const;

/** Loose input schema for the tool (JSON-schema friendly). Strict checks run in execute. */
const inputSchema = z.object({
  scene_id: z.number().int().positive(),
  scene_rows: z.array(z.number().int().positive()).min(1),
  grid_required: z.boolean(),
  status: z.enum(["approved_grid", "skip_recorded"]),
  grid_handle: z.string().nullable(),
  approved_candidate_id: z.string().nullable(),
  skip_reason: z.enum(SKIP_REASONS).nullable(),
  panel_map: z.record(z.string(), z.number().int().positive().nullable()),
  generation_groups: z
    .array(
      z.object({
        shot_ids: z.array(z.number().int().positive()).min(1),
        panel_ids: z.array(z.number().int().positive()),
      })
    )
    .min(1),
});

export type SceneGridRegistryEntry = z.infer<typeof inputSchema>;

function validateEntry(entry: SceneGridRegistryEntry): string[] {
  const errors: string[] = [];

  if (entry.status === "approved_grid") {
    if (!entry.grid_handle) errors.push("approved_grid requires grid_handle");
    if (!entry.approved_candidate_id) errors.push("approved_grid requires approved_candidate_id");
    if (entry.skip_reason != null) errors.push("approved_grid must not set skip_reason");
  }
  if (entry.status === "skip_recorded") {
    if (!entry.skip_reason) errors.push("skip_recorded requires skip_reason");
    if (entry.grid_handle != null) errors.push("skip_recorded must not set grid_handle");
  }

  for (const row of entry.scene_rows) {
    if (!(String(row) in entry.panel_map)) {
      errors.push(`panel_map missing scene_rows entry ${row}`);
    }
  }
  for (const key of Object.keys(entry.panel_map)) {
    if (!entry.scene_rows.includes(Number(key))) {
      errors.push(`panel_map has shot ${key} not in scene_rows`);
    }
  }

  const rowSet = new Set(entry.scene_rows.map(String));
  for (const [gi, group] of entry.generation_groups.entries()) {
    for (const id of group.shot_ids) {
      if (!rowSet.has(String(id))) {
        errors.push(`generation_groups[${gi}] shot ${id} not in scene_rows`);
      }
    }
    for (const [pi, panelId] of group.panel_ids.entries()) {
      const anyMatch = Object.values(entry.panel_map).includes(panelId);
      if (!anyMatch) {
        errors.push(`generation_groups[${gi}].panel_ids[${pi}]=${panelId} not in panel_map`);
      }
    }
  }

  return errors;
}

export const recordSceneGridEntry = tool({
  description:
    "Record ONE scene's Scene Grid Registry entry after grid approval or an explicit skip (Stage 1 Step 16). " +
    "The app validates the entry — do not invent freeform registry JSON in chat. " +
    "Call once per scene. Stage 1 is incomplete until every scene has a passing entry. " +
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
