import { tool } from "ai";
import { z } from "zod";
import { generateImage, type CharacterRef } from "@/server/services/media";

const GRID_CANDIDATE_COUNT = 1;

const panelCaptionSchema = z.object({
  motionArc: z
    .string()
    .describe("Motion arc for this panel from the shot row (what moves / changes in the cut-in moment)."),
  handoff: z
    .string()
    .describe("Handoff into the next panel / shot (eyeline, exit, match cut, or end-of-scene)."),
});

export type PanelCaptionInput = z.infer<typeof panelCaptionSchema>;

const generateSceneGridInputSchema = z.object({
  sceneId: z.union([z.string(), z.number()]).describe("Scene id/number this grid belongs to, e.g. 3"),
  imagePrompt: z
    .string()
    .describe(
      "Full grid image prompt assembled per references/grid-storyboards.md: references + layout spec + per-panel list (cut-in moment + Scale) + the continuity instruction + the Look."
    ),
  referenceImageUrls: z
    .array(z.string())
    .describe("Approved reference image URLs for every @material this scene uses, in citation order."),
  panelCount: z
    .number()
    .int()
    .min(1)
    .max(6)
    .describe("Number of panels in this grid image (1–6). Must equal panelCaptions.length."),
  panelCaptions: z
    .array(panelCaptionSchema)
    .min(1)
    .max(6)
    .describe(
      "One caption per panel, in panel order. Length MUST equal panelCount. Shown under the grid as a caption strip."
    ),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1"])
    .default("16:9")
    .describe("The film's LOCKED aspect ratio from the Look — panels must render in the film's true ratio."),
});

export type GenerateSceneGridInput = z.infer<typeof generateSceneGridInputSchema>;

/** Returns an error message when caption count does not match panel count; otherwise null. */
export function validatePanelCaptionCount(
  panelCount: number | undefined,
  panelCaptions: PanelCaptionInput[] | undefined
): string | null {
  if (panelCount == null || !Number.isInteger(panelCount) || panelCount < 1 || panelCount > 6) {
    return "panelCount is required and must be an integer from 1 to 6";
  }
  if (!panelCaptions || panelCaptions.length === 0) {
    return "panelCaptions is required — one motionArc + handoff per panel";
  }
  if (panelCaptions.length !== panelCount) {
    return `panelCaptions length (${panelCaptions.length}) must equal panelCount (${panelCount})`;
  }
  return null;
}

export const generateSceneGrid = tool({
  description:
    "Generate a candidate scene grid storyboard image for ONE scene (Stage 1 Step 16). Call this once per " +
    "scene, present it, wait for the user's approval, then call again for the next scene. Never batch " +
    "multiple scenes in a single turn. Only call once the scene's shot rows are locked and every " +
    "@material it uses (characters + location plate) has an APPROVED reference image. " +
    "Always pass panelCount and panelCaptions with matching lengths (one motionArc + handoff per panel). " +
    "After approval or skip, call recordSceneGridEntry for that scene.",
  inputSchema: generateSceneGridInputSchema,
});

/** Shared by the chat route (first generation) and the retry-tool route (regeneration). */
export async function generateSceneGridImages(
  imagePrompt: string,
  referenceImageUrls: string[],
  aspectRatio: "16:9" | "9:16" | "1:1"
): Promise<string[]> {
  const characterRefs: CharacterRef[] = referenceImageUrls.map((url) => ({
    url,
    description: "preserve exact appearance",
  }));
  const results = await Promise.all(
    Array.from({ length: GRID_CANDIDATE_COUNT }, () =>
      generateImage(imagePrompt, "gpt-image-2", characterRefs, aspectRatio)
    )
  );
  return results.map((r) => r.url);
}
