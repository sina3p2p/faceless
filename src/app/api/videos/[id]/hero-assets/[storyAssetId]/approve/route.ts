import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { videoStoryAssets } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { and, eq } from "drizzle-orm";
import { assertUserOwnsVideo } from "@/server/db/story-assets";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; storyAssetId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id, storyAssetId } = await params;
  if (!(await assertUserOwnsVideo(user.id, id))) return notFound("Video not found");

  const updated = await db
    .update(videoStoryAssets)
    .set({ approvalStatus: "approved", approvedAt: new Date() })
    .where(
      and(
        eq(videoStoryAssets.videoProjectId, id),
        eq(videoStoryAssets.storyAssetId, storyAssetId)
      )
    )
    .returning();

  if (updated.length === 0) return notFound("Hero asset link not found");

  return NextResponse.json({ success: true });
}
