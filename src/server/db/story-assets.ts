import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  storyAssets,
  series,
  seriesStoryAssets,
  videoStoryAssets,
  videoProjects,
} from "@/server/db/schema";
import type { StoryAssetInput } from "@/types/worker";

export type StoryAssetRow = typeof storyAssets.$inferSelect;

/** Shape returned to dashboard / JSON APIs (no internal fields). */
export function storyAssetToClient(row: StoryAssetRow) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    url: row.url,
    sheetUrl: row.sheetUrl ?? undefined,
    voiceId: row.voiceId ?? undefined,
  };
}

export function storyAssetRowToInput(row: StoryAssetRow): StoryAssetInput {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    url: row.url,
    sheetUrl: row.sheetUrl ?? undefined,
    voiceId: row.voiceId ?? undefined,
  };
}

/** Video-level links win; otherwise inherit series-linked assets when `seriesId` is set. */
export async function getStoryAssetInputsForVideoProject(videoProjectId: string): Promise<StoryAssetInput[]> {
  const ownRows = await db
    .select({ asset: storyAssets })
    .from(videoStoryAssets)
    .innerJoin(storyAssets, eq(videoStoryAssets.storyAssetId, storyAssets.id))
    .where(eq(videoStoryAssets.videoProjectId, videoProjectId))
    .orderBy(asc(videoStoryAssets.sortOrder));

  if (ownRows.length > 0) return ownRows.map((r) => storyAssetRowToInput(r.asset));

  const v = await db.query.videoProjects.findFirst({
    where: eq(videoProjects.id, videoProjectId),
    columns: { seriesId: true },
  });
  if (!v?.seriesId) return [];

  const seriesRows = await db
    .select({ asset: storyAssets })
    .from(seriesStoryAssets)
    .innerJoin(storyAssets, eq(seriesStoryAssets.storyAssetId, storyAssets.id))
    .where(eq(seriesStoryAssets.seriesId, v.seriesId))
    .orderBy(asc(seriesStoryAssets.sortOrder));

  return seriesRows.map((r) => storyAssetRowToInput(r.asset));
}

export async function listStoryAssetsForSeries(seriesId: string): Promise<StoryAssetRow[]> {
  const rows = await db
    .select({ asset: storyAssets })
    .from(seriesStoryAssets)
    .innerJoin(storyAssets, eq(seriesStoryAssets.storyAssetId, storyAssets.id))
    .where(eq(seriesStoryAssets.seriesId, seriesId))
    .orderBy(asc(seriesStoryAssets.sortOrder));
  return rows.map((r) => r.asset);
}

export async function listStoryAssetsForVideo(videoProjectId: string): Promise<StoryAssetRow[]> {
  const rows = await db
    .select({ asset: storyAssets })
    .from(videoStoryAssets)
    .innerJoin(storyAssets, eq(videoStoryAssets.storyAssetId, storyAssets.id))
    .where(eq(videoStoryAssets.videoProjectId, videoProjectId))
    .orderBy(asc(videoStoryAssets.sortOrder));
  return rows.map((r) => r.asset);
}

export async function insertSeriesStoryAssets(
  seriesId: string,
  userId: string,
  assets: Array<{
    id: string;
    type: "character" | "location" | "prop";
    name: string;
    description: string;
    url: string;
    sheetUrl?: string;
    voiceId?: string;
  }>
): Promise<void> {
  if (assets.length === 0) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      await tx.insert(storyAssets).values({
        id: a.id,
        userId,
        type: a.type,
        name: a.name,
        description: a.description,
        url: a.url,
        sheetUrl: a.sheetUrl ?? null,
        voiceId: a.voiceId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(seriesStoryAssets).values({
        seriesId,
        storyAssetId: a.id,
        sortOrder: i,
      });
    }
  });
}

export async function getStoryAssetForUser(
  assetId: string,
  userId: string
): Promise<StoryAssetRow | undefined> {
  return db.query.storyAssets.findFirst({
    where: and(eq(storyAssets.id, assetId), eq(storyAssets.userId, userId)),
  });
}

export async function hasSeriesStoryAssetLink(seriesId: string, assetId: string): Promise<boolean> {
  const [row] = await db
    .select({ one: seriesStoryAssets.seriesId })
    .from(seriesStoryAssets)
    .where(and(eq(seriesStoryAssets.seriesId, seriesId), eq(seriesStoryAssets.storyAssetId, assetId)))
    .limit(1);
  return !!row;
}

export async function hasVideoStoryAssetLink(
  videoProjectId: string,
  assetId: string
): Promise<boolean> {
  const [row] = await db
    .select({ one: videoStoryAssets.videoProjectId })
    .from(videoStoryAssets)
    .where(
      and(eq(videoStoryAssets.videoProjectId, videoProjectId), eq(videoStoryAssets.storyAssetId, assetId))
    )
    .limit(1);
  return !!row;
}

/** Remove junction row only (canonical story_assets row remains). */
export async function unlinkStoryAssetFromSeries(
  userId: string,
  seriesId: string,
  assetId: string
): Promise<boolean> {
  if (!(await assertUserOwnsSeries(userId, seriesId))) return false;
  if (!(await hasSeriesStoryAssetLink(seriesId, assetId))) return false;
  await db
    .delete(seriesStoryAssets)
    .where(and(eq(seriesStoryAssets.seriesId, seriesId), eq(seriesStoryAssets.storyAssetId, assetId)));
  return true;
}

export async function unlinkStoryAssetFromVideo(
  userId: string,
  videoProjectId: string,
  assetId: string
): Promise<boolean> {
  if (!(await assertUserOwnsVideo(userId, videoProjectId))) return false;
  if (!(await hasVideoStoryAssetLink(videoProjectId, assetId))) return false;
  await db
    .delete(videoStoryAssets)
    .where(
      and(eq(videoStoryAssets.videoProjectId, videoProjectId), eq(videoStoryAssets.storyAssetId, assetId))
    );
  return true;
}

/** Insert canonical story asset and link to series or video (caller must have validated ownership). */
export async function saveNewStoryAssetWithLink(
  userId: string,
  link: { seriesId: string } | { videoProjectId: string },
  values: {
    type: "character" | "location" | "prop";
    name: string;
    description: string;
    url: string;
    voiceId?: string | null;
  }
): Promise<StoryAssetRow> {
  const newId = crypto.randomUUID();
  const now = new Date();

  if ("seriesId" in link) {
    const current = await listStoryAssetsForSeries(link.seriesId);
    const sortOrder = current.length;
    await db.transaction(async (tx) => {
      await tx.insert(storyAssets).values({
        id: newId,
        userId,
        type: values.type,
        name: values.name,
        description: values.description,
        url: values.url,
        voiceId: values.voiceId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(seriesStoryAssets).values({
        seriesId: link.seriesId,
        storyAssetId: newId,
        sortOrder,
      });
    });
  } else {
    const current = await listStoryAssetsForVideo(link.videoProjectId);
    const sortOrder = current.length;
    await db.transaction(async (tx) => {
      await tx.insert(storyAssets).values({
        id: newId,
        userId,
        type: values.type,
        name: values.name,
        description: values.description,
        url: values.url,
        voiceId: values.voiceId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(videoStoryAssets).values({
        videoProjectId: link.videoProjectId,
        storyAssetId: newId,
        sortOrder,
      });
    });
  }

  const row = await db.query.storyAssets.findFirst({ where: eq(storyAssets.id, newId) });
  if (!row) throw new Error("Failed to load saved story asset");
  return row;
}

export async function updateStoryAssetForUser(
  userId: string,
  assetId: string,
  patch: Partial<{
    name: string;
    description: string;
    type: "character" | "location" | "prop";
    sheetUrl: string | null;
    voiceId: string | null;
  }>
): Promise<StoryAssetRow | undefined> {
  const owned = await getStoryAssetForUser(assetId, userId);
  if (!owned) return undefined;

  const dbPatch: Partial<typeof storyAssets.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.description !== undefined) dbPatch.description = patch.description;
  if (patch.type !== undefined) dbPatch.type = patch.type;
  if (patch.sheetUrl !== undefined) dbPatch.sheetUrl = patch.sheetUrl;
  if (patch.voiceId !== undefined) dbPatch.voiceId = patch.voiceId;

  await db.update(storyAssets).set(dbPatch).where(eq(storyAssets.id, assetId));
  return getStoryAssetForUser(assetId, userId);
}

export async function assertUserOwnsSeries(userId: string, seriesId: string): Promise<boolean> {
  const s = await db.query.series.findFirst({
    where: and(eq(series.id, seriesId), eq(series.userId, userId)),
    columns: { id: true },
  });
  return !!s;
}

export async function assertUserOwnsVideo(userId: string, videoProjectId: string): Promise<boolean> {
  const v = await db.query.videoProjects.findFirst({
    where: and(eq(videoProjects.id, videoProjectId), eq(videoProjects.userId, userId)),
    columns: { id: true },
  });
  return !!v;
}

export async function insertVideoStoryAssets(
  videoProjectId: string,
  userId: string,
  assets: Array<{
    id: string;
    type: "character" | "location" | "prop";
    name: string;
    description: string;
    url: string;
    sheetUrl?: string;
    voiceId?: string;
  }>
): Promise<void> {
  if (assets.length === 0) return;
  const now = new Date();
  await db.transaction(async (tx) => {
    for (let i = 0; i < assets.length; i++) {
      const a = assets[i];
      await tx.insert(storyAssets).values({
        id: a.id,
        userId,
        type: a.type,
        name: a.name,
        description: a.description,
        url: a.url,
        sheetUrl: a.sheetUrl ?? null,
        voiceId: a.voiceId ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(videoStoryAssets).values({
        videoProjectId,
        storyAssetId: a.id,
        sortOrder: i,
      });
    }
  });
}
