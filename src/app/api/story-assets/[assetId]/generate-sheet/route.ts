import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import type { CharacterRef } from "@/server/services/media";
import { getSignedDownloadUrl } from "@/lib/storage";
import { generateStoryAssetSheetToStorage } from "@/server/services/story-asset-tools";
import { getStoryAssetForUser } from "@/server/db/story-assets";

/**
 * POST — generate reference sheet preview for a saved story asset (upload only; caller PATCHes sheetUrl to accept).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { assetId } = await params;
  const asset = await getStoryAssetForUser(assetId, user.id);
  if (!asset) return notFound("Asset not found");

  try {
    const originalUrl = asset.url.startsWith("http") ? asset.url : await getSignedDownloadUrl(asset.url);
    const ref: CharacterRef = {
      url: originalUrl,
      description: asset.description,
      name: asset.name,
      type: asset.type,
    };

    const key = `story-assets/${assetId}/sheet_${Date.now()}.jpg`;
    const { sheetUrl, previewUrl } = await generateStoryAssetSheetToStorage({
      ref,
      type: asset.type,
      storageKey: key,
    });

    return NextResponse.json({ sheetUrl, previewUrl });
  } catch (err) {
    console.error(`story-assets/${assetId}/generate-sheet failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sheet generation failed" },
      { status: 500 }
    );
  }
}
