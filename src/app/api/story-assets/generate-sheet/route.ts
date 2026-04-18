import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import type { CharacterRef } from "@/server/services/media";
import { getSignedDownloadUrl } from "@/lib/storage";
import { generateStoryAssetSheetToStorage } from "@/server/services/story-asset-tools";

const bodySchema = z.object({
  imageUrl: z.string().min(1),
  description: z.string().default(""),
  name: z.string().default(""),
  type: z.enum(["character", "location", "prop"]).default("character"),
});

/**
 * POST — generate a reference sheet from a transient image URL (e.g. draft upload).
 * Does not require a saved story_assets row.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { imageUrl, description, name, type } = parsed.data;

  try {
    const signedUrl = imageUrl.startsWith("http") ? imageUrl : await getSignedDownloadUrl(imageUrl);
    const ref: CharacterRef = {
      url: signedUrl,
      description,
      name,
      type,
    };

    const key = `sheets/temp_${user.id}_${Date.now()}.jpg`;
    const { sheetUrl, previewUrl } = await generateStoryAssetSheetToStorage({
      ref,
      type,
      storageKey: key,
    });

    return NextResponse.json({ sheetUrl, previewUrl });
  } catch (err) {
    console.error("story-assets/generate-sheet failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sheet generation failed" },
      { status: 500 }
    );
  }
}
