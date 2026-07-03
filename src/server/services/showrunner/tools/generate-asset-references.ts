import { tool } from "ai";
import { z } from "zod";
import { generateImage } from "@/server/services/media";

const ASSET_CANDIDATE_COUNT = 1;

export const generateAssetReferences = tool({
  description:
    "Generate candidate reference images for ONE locked character or location asset. " +
    "Call this once per asset, one at a time — present an asset, wait for the user's " +
    "approval, then call again for the next asset. Never batch multiple assets in a single " +
    "turn. Only call once the Look block is locked.",
  inputSchema: z.object({
    assetHandle: z.string().describe('Named handle, e.g. "hero_charsheet" or "rooftop_plate"'),
    assetKind: z.enum(["character", "location"]),
    imagePrompt: z
      .string()
      .describe(
        "Full image generation prompt: expand the locked spec + the locked Look block into a single self-contained prompt ready for an image model."
      ),
  }),
});

/** Shared by the chat route (first generation) and the retry-tool route (regeneration). */
export async function generateAssetImages(
  imagePrompt: string,
  assetKind: "character" | "location"
): Promise<string[]> {
  const aspectRatio = assetKind === "location" ? ("16:9" as const) : ("1:1" as const);
  const results = await Promise.all(
    Array.from({ length: ASSET_CANDIDATE_COUNT }, () =>
      generateImage(imagePrompt, "gpt-image-2", undefined, aspectRatio)
    )
  );
  return results.map((r) => r.url);
}
