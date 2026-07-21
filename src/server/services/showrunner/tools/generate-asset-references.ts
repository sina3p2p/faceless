import { tool } from "ai";
import { z } from "zod";
import { generateImage } from "@/server/services/media";
import { mediaUrl } from "@/lib/storage";
import { media } from "@/server/db/schema";
import { db } from "@/server/db";
import { candidateKey, normalizeHandle } from "@/server/services/showrunner/handle-resolver";

const ASSET_CANDIDATE_COUNT = 1;

const assetSpecSchema = z.object({
  assetHandle: z
    .string()
    .describe('Named handle, e.g. "hero_charsheet", "rooftop_plate", or "ship_object_ref"'),
  assetKind: z.enum(["character", "location", "object"]),
  imagePrompt: z
    .string()
    .describe(
      "Full image generation prompt: expand the locked spec + the locked Look block into a single self-contained prompt ready for an image model."
    ),
});

export type AssetSpecInput = z.infer<typeof assetSpecSchema>;

export type AssetCandidate = { id: string; url: string };

export type GeneratedAssetItem = {
  assetHandle: string;
  assetKind: "character" | "location" | "object" | "voice";
  candidates: AssetCandidate[];
  sampleText?: string;
};

export const generateAssetReferences = tool({
  description:
    "Generate candidate reference images for the FULL audited asset manifest (Stage 1 Step 9). " +
    "After the user approves the manifest list, call this ONCE with every asset expanded — characters " +
    "first, then objects, then locations. Assets are independent (each prompt derives only from its " +
    "locked spec + the locked Look). The app dispatches all generations together and presents ONE " +
    "gallery with one candidate per asset. When vision_status:attached, pre-screen pixels (twin-bug / " +
    "plate checks) in that turn. Wait for gallery Approve (`asset_approval` with per-asset candidate " +
    "ids = storage keys) — never askQuestions for approval, never treat free text as approval. " +
    "Do not call this one asset at a time.",
  inputSchema: z.object({
    assets: z
      .array(assetSpecSchema)
      .min(1)
      .describe(
        "Every manifest entry, characters first. One call = the whole gallery."
      ),
  }),
});

/** Shared by the chat route (first generation) and the retry-tool route (regeneration). */
export async function generateAssetImages(
  imagePrompt: string,
  assetKind: "character" | "location" | "object",
  userId: string,
  sessionId: string,
  assetHandle: string
): Promise<AssetCandidate[]> {
  const handle = normalizeHandle(assetHandle);
  if (!handle) {
    throw new Error(
      `Invalid assetHandle "${assetHandle}" — must be @?[a-z0-9_]+`
    );
  }
  const aspectRatio = assetKind === "location" ? ("16:9" as const) : ("1:1" as const);
  const results = await Promise.all(
    Array.from({ length: ASSET_CANDIDATE_COUNT }, () =>
      generateImage({
        model: "gpt-image-2",
        prompt: imagePrompt,
        aspectRatio,
        storageKey: candidateKey(sessionId, handle, "png"),
      })
    )
  );
  const images = results.flat();

  await db.insert(media).values(
    images.map((img) => ({
      userId,
      type: "image" as const,
      url: img,
      prompt: imagePrompt,
      modelUsed: "gpt-image-2",
      metadata: { aspectRatio, handle },
    }))
  );

  return Promise.all(
    images.map(async (img) => ({
      id: img,
      url: await mediaUrl(img),
    }))
  );
}

/** Parallel gallery generation — one result row per manifest entry. */
export async function generateAssetGallery(
  assets: AssetSpecInput[],
  userId: string,
  sessionId: string
): Promise<GeneratedAssetItem[]> {
  return Promise.all(
    assets.map(async (asset) => ({
      assetHandle: asset.assetHandle,
      assetKind: asset.assetKind,
      candidates: await generateAssetImages(
        asset.imagePrompt,
        asset.assetKind,
        userId,
        sessionId,
        asset.assetHandle
      ),
    }))
  );
}
