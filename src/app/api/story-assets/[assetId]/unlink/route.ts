import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import {
  listStoryAssetsForSeries,
  listStoryAssetsForVideo,
  storyAssetToClient,
  unlinkStoryAssetFromSeries,
  unlinkStoryAssetFromVideo,
} from "@/server/db/story-assets";

const bodySchema = z
  .object({
    seriesId: z.string().optional(),
    videoProjectId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const a = !!data.seriesId;
    const b = !!data.videoProjectId;
    if (a === b) {
      ctx.addIssue({
        code: "custom",
        message: "Provide exactly one of seriesId or videoProjectId",
        path: ["seriesId"],
      });
    }
  });

/**
 * POST — unlink this asset from a series or video you own. Returns the updated asset list for that scope.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { assetId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const { seriesId, videoProjectId } = parsed.data;

  if (seriesId) {
    const ok = await unlinkStoryAssetFromSeries(user.id, seriesId, assetId);
    if (!ok) return notFound("Series or link not found");
    const storyAssets = (await listStoryAssetsForSeries(seriesId)).map(storyAssetToClient);
    return NextResponse.json({ storyAssets });
  }

  const ok = await unlinkStoryAssetFromVideo(user.id, videoProjectId!, assetId);
  if (!ok) return notFound("Video or link not found");
  const storyAssets = (await listStoryAssetsForVideo(videoProjectId!)).map(storyAssetToClient);
  return NextResponse.json({ storyAssets });
}
