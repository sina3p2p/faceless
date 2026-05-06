import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { storyAssets, videoStoryAssets } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { and, asc, eq } from "drizzle-orm";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { assertUserOwnsVideo } from "@/server/db/story-assets";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await assertUserOwnsVideo(user.id, id))) return notFound("Video not found");

  const rows = await db
    .select({
      asset: storyAssets,
      link: videoStoryAssets,
    })
    .from(videoStoryAssets)
    .innerJoin(storyAssets, eq(videoStoryAssets.storyAssetId, storyAssets.id))
    .where(eq(videoStoryAssets.videoProjectId, id))
    .orderBy(asc(videoStoryAssets.sortOrder));

  const heroAssets = await Promise.all(
    rows.map(async (r) => ({
      id: r.asset.id,
      type: r.asset.type,
      name: r.asset.name,
      description: r.asset.description,
      url: r.asset.url.startsWith("http") ? r.asset.url : await getSignedDownloadUrl(r.asset.url),
      sheetUrl: r.asset.sheetUrl
        ? r.asset.sheetUrl.startsWith("http")
          ? r.asset.sheetUrl
          : await getSignedDownloadUrl(r.asset.sheetUrl)
        : null,
      approvalStatus: r.link.approvalStatus,
      approvedAt: r.link.approvedAt,
      sortOrder: r.link.sortOrder,
      generated: !!r.link.generatedByJobId,
    }))
  );

  return NextResponse.json({ heroAssets });
}

/**
 * Upload a user-supplied image as a hero asset (e.g. brand mascot, product photo).
 * Auto-approves the new asset. Body: multipart/form-data with `file`, `name`,
 * `type`, optional `description`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await assertUserOwnsVideo(user.id, id))) return notFound("Video not found");

  const form = await req.formData();
  const file = form.get("file");
  const name = (form.get("name") as string | null)?.trim();
  const type = form.get("type") as string | null;
  const description = ((form.get("description") as string | null) ?? "").trim();

  if (!(file instanceof File)) return badRequest("file is required");
  if (!name) return badRequest("name is required");
  if (type !== "character" && type !== "location" && type !== "prop") {
    return badRequest("type must be character, location, or prop");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? ".jpg").toLowerCase();
  const key = `hero-assets/${id}/upload_${Date.now()}${ext}`;
  await uploadFile(key, buffer, file.type || "image/jpeg");

  const newId = crypto.randomUUID();
  const now = new Date();

  // Find next sort order
  const existing = await db.query.videoStoryAssets.findMany({
    where: eq(videoStoryAssets.videoProjectId, id),
    columns: { sortOrder: true },
  });
  const sortOrder = existing.length;

  await db.transaction(async (tx) => {
    await tx.insert(storyAssets).values({
      id: newId,
      userId: user.id,
      type,
      name,
      description,
      url: key,
      sheetUrl: key,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(videoStoryAssets).values({
      videoProjectId: id,
      storyAssetId: newId,
      sortOrder,
      approvalStatus: "approved",
      approvedAt: now,
    });
  });

  return NextResponse.json({ success: true, id: newId });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;
  if (!(await assertUserOwnsVideo(user.id, id))) return notFound("Video not found");

  const url = new URL(req.url);
  const storyAssetId = url.searchParams.get("storyAssetId");
  if (!storyAssetId) return badRequest("storyAssetId query param required");

  await db
    .delete(videoStoryAssets)
    .where(
      and(
        eq(videoStoryAssets.videoProjectId, id),
        eq(videoStoryAssets.storyAssetId, storyAssetId)
      )
    );

  return NextResponse.json({ success: true });
}
