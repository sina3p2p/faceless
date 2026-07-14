import { tool } from "ai";
import { z } from "zod";
import { generateImage } from "@/server/services/media";
import { mediaUrl } from "@/lib/storage";
import { media } from "@/server/db/schema";
import { db } from "@/server/db";

const ASSET_CANDIDATE_COUNT = 1;

export const generateAssetReferences = tool({
  description:
    "Generate candidate reference images for ONE locked character or location asset. " +
    "Call this once per asset, one at a time — present an asset, wait for the user's " +
    "approval, then call again for the next asset. Never batch multiple assets in a single " +
    "turn. Only call once the Look block is locked.",
  inputSchema: z.object({
    assetHandle: z
      .string()
      .describe('Named handle, e.g. "hero_charsheet", "rooftop_plate", or "ship_object_ref"'),
    assetKind: z.enum(["character", "location", "object"]),
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
  assetKind: "character" | "location" | "object",
  userId: string,
): Promise<string[]> {
  const aspectRatio = assetKind === "location" ? ("16:9" as const) : ("1:1" as const);
  const results = await Promise.all(
    Array.from({ length: ASSET_CANDIDATE_COUNT }, () =>
      generateImage({
        model: "gpt-image-2",
        prompt: imagePrompt,
        aspectRatio,
      })
    )
  );
  const images = results.flat();

  await db.insert(media).values(images.map(img => ({
    userId,
    type: "image",
    url: img,
    prompt: imagePrompt,
    modelUsed: "gpt-image-2",
    metadata: { aspectRatio },
  })));

  return Promise.all(images.map((img) => mediaUrl(img)));
}