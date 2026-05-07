import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { storyAssets, videoStoryAssets, videoProjects } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest, serverError } from "@/lib/api-utils";
import { and, eq } from "drizzle-orm";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { generateImage, type CharacterRef } from "@/server/services/media";
import {
  buildHeroAssetSheetPrompt,
  aspectRatioForHeroAsset,
} from "@/server/services/llm";
import { assertUserOwnsVideo } from "@/server/db/story-assets";

/**
 * Regenerate the sheet image for a single hero asset.
 *
 * Body: { promptTweak?: string, referenceImageUrl?: string }
 *  - promptTweak: free-text appended to the auto-built sheet prompt
 *  - referenceImageUrl: optional public/signed url; passed as a CharacterRef so
 *    the new image conditions on the user's reference.
 *
 * Resets approvalStatus to "pending".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; storyAssetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, storyAssetId } = await params;
  if (!(await assertUserOwnsVideo(user.id, id))) return notFound("Video not found");

  const body = (await req.json().catch(() => ({}))) as {
    promptTweak?: string;
    referenceImageUrl?: string;
  };

  const video = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, id),
    columns: { id: true, modelSettings: true, config: true },
  });
  if (!video) return notFound("Video not found");

  const asset = await db.query.storyAssets.findFirst({
    where: and(eq(storyAssets.id, storyAssetId), eq(storyAssets.userId, user.id)),
  });
  if (!asset) return notFound("Hero asset not found");

  const link = await db.query.videoStoryAssets.findFirst({
    where: and(
      eq(videoStoryAssets.videoProjectId, id),
      eq(videoStoryAssets.storyAssetId, storyAssetId)
    ),
  });
  if (!link) return notFound("Hero asset is not linked to this video");

  const planEntry = video.config?.heroAssetPlan?.entries.find(
    (e) => e.assetRef === storyAssetId || e.name === asset.name
  );

  const baseEntry = {
    name: asset.name,
    type: asset.type,
    description: asset.description,
    appearance: planEntry?.appearance ?? asset.description,
    sheetPromptHints: planEntry?.sheetPromptHints ?? "",
    rationale: planEntry?.rationale ?? "",
  };

  const promptTweak = (body.promptTweak ?? "").trim();
  let prompt = buildHeroAssetSheetPrompt(baseEntry, video.config?.visualStyleGuide);
  if (promptTweak) prompt = `${prompt} ${promptTweak}`;

  const refs: CharacterRef[] = [];
  if (body.referenceImageUrl) {
    refs.push({
      url: mediaUrl(body.referenceImageUrl),
      description: `User-supplied reference for ${asset.name}; preserve identity.`,
      name: asset.name,
      type: asset.type,
    });
  }

  const aspect = aspectRatioForHeroAsset(asset.type);
  const imageModel = video.modelSettings.imageModel;

  let storedKey: string;
  try {
    const result = await generateImage(prompt, imageModel!, refs, aspect);
    const imgResp = await fetch(result.url);
    if (!imgResp.ok) throw new Error("Failed to download regenerated sheet");
    const buffer = Buffer.from(await imgResp.arrayBuffer());
    const key = `hero-assets/${id}/${storyAssetId}_${Date.now()}.jpg`;
    await uploadFile(key, buffer, "image/jpeg");
    storedKey = key;
  } catch (err) {
    return serverError(
      `Regeneration failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }

  if (!storedKey) return badRequest("Regeneration produced no image");

  const now = new Date();
  await db
    .update(storyAssets)
    .set({ url: storedKey, sheetUrl: storedKey, updatedAt: now })
    .where(eq(storyAssets.id, storyAssetId));

  await db
    .update(videoStoryAssets)
    .set({ approvalStatus: "pending", approvedAt: null })
    .where(
      and(
        eq(videoStoryAssets.videoProjectId, id),
        eq(videoStoryAssets.storyAssetId, storyAssetId)
      )
    );

  return NextResponse.json({ success: true, sheetUrl: mediaUrl(storedKey) });
}
