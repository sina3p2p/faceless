import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { uploadFile } from "@/lib/storage";
import { z } from "zod/v4";

type StoryAsset = {
  id: string;
  type: "character" | "location" | "prop";
  name: string;
  description: string;
  url: string;
  sheetUrl?: string;
  voiceId?: string;
};

// POST: Add a new story asset (file upload or JSON with url)
const addAssetSchema = z.object({
  url: z.string().min(1),
  name: z.string().default(""),
  description: z.string().default(""),
  type: z.enum(["character", "location", "prop"]).default("character"),
  voiceId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    columns: { id: true, storyAssets: true },
  });
  if (!existing) return notFound("Series not found");

  const currentAssets = (existing.storyAssets ?? []) as StoryAsset[];
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const parsed = addAssetSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const newAsset: StoryAsset = {
      id: crypto.randomUUID(),
      type: parsed.data.type,
      name: parsed.data.name,
      description: parsed.data.description,
      url: parsed.data.url,
    };
    if (parsed.data.voiceId) newAsset.voiceId = parsed.data.voiceId;

    const updated = [...currentAssets, newAsset];
    await db
      .update(series)
      .set({ storyAssets: updated, updatedAt: new Date() })
      .where(eq(series.id, id));

    return NextResponse.json({ storyAssets: updated });
  }

  // File upload
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const assetType = (formData.get("type") as string) || "character";
  const assetName = (formData.get("name") as string) || "";

  if (!file) return badRequest("No file provided");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return badRequest("File must be JPEG, PNG, or WebP");
  }
  if (file.size > 10 * 1024 * 1024) {
    return badRequest("File must be under 10MB");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `series/${id}/asset_${Date.now()}.${ext}`;

  await uploadFile(key, buffer, file.type);

  const newAsset: StoryAsset = {
    id: crypto.randomUUID(),
    type: assetType as "character" | "location" | "prop",
    name: assetName,
    description: "",
    url: key,
  };

  const updated = [...currentAssets, newAsset];
  await db
    .update(series)
    .set({ storyAssets: updated, updatedAt: new Date() })
    .where(eq(series.id, id));

  return NextResponse.json({ storyAssets: updated });
}

// PATCH: Update an asset by ID
const updateAssetSchema = z.object({
  assetId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  type: z.enum(["character", "location", "prop"]).optional(),
  sheetUrl: z.string().nullable().optional(),
  voiceId: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    columns: { id: true, storyAssets: true },
  });
  if (!existing) return notFound("Series not found");

  const body = await req.json();
  const parsed = updateAssetSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const assets = [...((existing.storyAssets ?? []) as StoryAsset[])];
  const idx = assets.findIndex((a) => a.id === parsed.data.assetId);
  if (idx === -1) return badRequest("Asset not found");

  if (parsed.data.name !== undefined) assets[idx].name = parsed.data.name;
  if (parsed.data.description !== undefined) assets[idx].description = parsed.data.description;
  if (parsed.data.type !== undefined) assets[idx].type = parsed.data.type;
  if (parsed.data.sheetUrl !== undefined) assets[idx].sheetUrl = parsed.data.sheetUrl ?? undefined;
  if (parsed.data.voiceId !== undefined) assets[idx].voiceId = parsed.data.voiceId ?? undefined;

  await db
    .update(series)
    .set({ storyAssets: assets, updatedAt: new Date() })
    .where(eq(series.id, id));

  return NextResponse.json({ storyAssets: assets });
}

// DELETE: Remove an asset by ID
const deleteAssetSchema = z.object({
  assetId: z.string(),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { id } = await params;

  const existing = await db.query.series.findFirst({
    where: and(eq(series.id, id), eq(series.userId, user.id)),
    columns: { id: true, storyAssets: true },
  });
  if (!existing) return notFound("Series not found");

  const body = await req.json().catch(() => ({}));
  const parsed = deleteAssetSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const assets = ((existing.storyAssets ?? []) as StoryAsset[]).filter(
    (a) => a.id !== parsed.data.assetId
  );

  await db
    .update(series)
    .set({ storyAssets: assets, updatedAt: new Date() })
    .where(eq(series.id, id));

  return NextResponse.json({ storyAssets: assets });
}
