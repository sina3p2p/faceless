import { tool } from "ai";
import { z } from "zod";

const notesSchema = z.object({
  roomGeography: z.string().min(1),
  characterBlocking: z.string().min(1),
  cameraAxis: z.string().min(1),
  lightingProgression: z.string().min(1),
  screenDirection: z.string().min(1),
  fixedProps: z.string().min(1),
});

const inputSchema = z.object({
  scene_id: z.number().int().positive(),
  pack_handle: z.string().min(1),
  approved_candidate_id: z.string().min(1),
  notes: notesSchema,
  keyframe_urls: z.array(z.string().min(1)).min(1).max(3),
  keyframe_roles: z
    .array(z.enum(["establishing", "blocking", "eyeline_props", "other"]))
    .min(1)
    .max(3),
});

export type ContinuityPackRegistryEntry = z.infer<typeof inputSchema>;

function validateEntry(entry: ContinuityPackRegistryEntry): string[] {
  const errors: string[] = [];
  if (entry.keyframe_urls.length !== entry.keyframe_roles.length) {
    errors.push("keyframe_urls length must equal keyframe_roles length");
  }
  if (entry.keyframe_urls.length < 1 || entry.keyframe_urls.length > 3) {
    errors.push("continuity pack requires 1–3 approved keyframe URLs");
  }
  for (const field of [
    "roomGeography",
    "characterBlocking",
    "cameraAxis",
    "lightingProgression",
    "screenDirection",
    "fixedProps",
  ] as const) {
    if (!entry.notes[field]?.trim()) {
      errors.push(`notes.${field} is required`);
    }
  }
  return errors;
}

export const recordContinuityPackEntry = tool({
  description:
    "Record ONE scene's approved continuity pack after continuity_pack_approval (Stage 1 Step 16). " +
    "Required before any generateGenerationGrid / recordGenerationGridEntry for that scene. " +
    "Pack = structured notes + 1–3 visual keyframes (reference only — not a Seedance sequence). " +
    "Set approved_candidate_id to the exact generateContinuityPack toolCallId.",
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
