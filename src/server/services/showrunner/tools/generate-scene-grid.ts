import { tool } from "ai";
import { z } from "zod";
import { generateImage, type CharacterRef } from "@/server/services/media";

const GRID_CANDIDATE_COUNT = 1;

export const generateSceneGrid = tool({
  description:
    "Generate a candidate scene grid storyboard image for ONE scene (Stage 1 Step 16). Call this once per " +
    "scene, present it, wait for the user's approval, then call again for the next scene. Never batch " +
    "multiple scenes in a single turn. Only call once the scene's shot rows are locked and every " +
    "@material it uses (characters + location plate) has an APPROVED reference image. " +
    "After approval or skip, call recordSceneGridEntry for that scene.",
  inputSchema: z.object({
    sceneId: z.union([z.string(), z.number()]).describe("Scene id/number this grid belongs to, e.g. 3"),
    imagePrompt: z
      .string()
      .describe(
        "Full grid image prompt assembled per references/grid-storyboards.md: references + layout spec + per-panel list (cut-in moment + Scale) + the continuity instruction + the Look."
      ),
    referenceImageUrls: z
      .array(z.string())
      .describe("Approved reference image URLs for every @material this scene uses, in citation order."),
    aspectRatio: z
      .enum(["16:9", "9:16", "1:1"])
      .default("16:9")
      .describe("The film's LOCKED aspect ratio from the Look — panels must render in the film's true ratio."),
  }),
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
