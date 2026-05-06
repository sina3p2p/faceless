import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { storyAssets, videoStoryAssets } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { and, eq } from "drizzle-orm";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { assertUserOwnsVideo } from "@/server/db/story-assets";
import { z } from "zod";

const bodySchema = z.object({
  imageUrl: z.string().min(1),
  editPrompt: z.string().optional(),
});

/**
 * Persist an edited hero asset image (output of /api/edit-image or a crop) into
 * the project's hero-assets storage prefix, swap it onto the storyAssets row,
 * and reset the link to "pending" so the user re-approves the new visual.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; storyAssetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id: videoId, storyAssetId } = await params;
  if (!(await assertUserOwnsVideo(user.id, videoId))) return notFound("Video not found");

  const asset = await db.query.storyAssets.findFirst({
    where: and(eq(storyAssets.id, storyAssetId), eq(storyAssets.userId, user.id)),
  });
  if (!asset) return notFound("Hero asset not found");

  const link = await db.query.videoStoryAssets.findFirst({
    where: and(
      eq(videoStoryAssets.videoProjectId, videoId),
      eq(videoStoryAssets.storyAssetId, storyAssetId)
    ),
  });
  if (!link) return notFound("Hero asset is not linked to this video");

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return badRequest(parsed.error.message);

  try {
    const sourceUrl = parsed.data.imageUrl.startsWith("http")
      ? parsed.data.imageUrl
      : await getSignedDownloadUrl(parsed.data.imageUrl);

    const imageResponse = await fetch(sourceUrl);
    if (!imageResponse.ok) throw new Error("Failed to download edited image");
    const buffer = Buffer.from(await imageResponse.arrayBuffer());

    const key = `hero-assets/${videoId}/edit_${storyAssetId}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");

    const now = new Date();
    await db
      .update(storyAssets)
      .set({ url: key, sheetUrl: key, updatedAt: now })
      .where(eq(storyAssets.id, storyAssetId));

    await db
      .update(videoStoryAssets)
      .set({ approvalStatus: "pending", approvedAt: null })
      .where(
        and(
          eq(videoStoryAssets.videoProjectId, videoId),
          eq(videoStoryAssets.storyAssetId, storyAssetId)
        )
      );

    const signedUrl = await getSignedDownloadUrl(key);
    return NextResponse.json({ success: true, sheetUrl: signedUrl });
  } catch (err) {
    console.error(`Save hero-asset edit failed for ${storyAssetId}:`, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 }
    );
  }
}
