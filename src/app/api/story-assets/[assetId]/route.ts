import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, badRequest, notFound } from "@/lib/api-utils";
import { getStoryAssetForUser, updateStoryAssetForUser, storyAssetToClient } from "@/server/db/story-assets";

const patchSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["character", "location", "prop"]).optional(),
  sheetUrl: z.string().nullable().optional(),
  voiceId: z.string().nullable().optional(),
});

/** PATCH — update canonical fields (all links see the change). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { assetId } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const updated = await updateStoryAssetForUser(user.id, assetId, parsed.data);
  if (!updated) return notFound("Asset not found");

  return NextResponse.json({ asset: storyAssetToClient(updated) });
}

/** GET — single asset (owner). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { assetId } = await params;
  const row = await getStoryAssetForUser(assetId, user.id);
  if (!row) return notFound("Asset not found");
  return NextResponse.json({ asset: storyAssetToClient(row) });
}
