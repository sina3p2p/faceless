import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, badRequest, notFound } from "@/lib/api-utils";
import { describeStoryAssetFromVision, imageUrlToVisionDataUrl } from "@/server/services/story-asset-tools";
import { getStoryAssetForUser, updateStoryAssetForUser } from "@/server/db/story-assets";

const bodySchema = z.object({
  persist: z.boolean().optional(),
});

/**
 * POST — describe a saved story asset from its stored image.
 * Optional { persist: true } writes description to the canonical row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { assetId } = await params;
  const asset = await getStoryAssetForUser(assetId, user.id);
  if (!asset) return notFound("Asset not found");

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);

  try {
    const dataUrl = await imageUrlToVisionDataUrl(asset.url);
    const description = await describeStoryAssetFromVision({
      dataUrl,
      assetType: asset.type,
    });

    if (parsed.success && parsed.data.persist) {
      await updateStoryAssetForUser(user.id, assetId, { description });
    }

    return NextResponse.json({ description });
  } catch (err) {
    console.error(`story-assets/${assetId}/describe failed:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Describe failed" },
      { status: 500 }
    );
  }
}
