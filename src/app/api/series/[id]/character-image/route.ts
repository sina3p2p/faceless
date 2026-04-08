import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { series } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { uploadFile } from "@/lib/storage";
import { z } from "zod/v4";

type CharacterImage = { url: string; description: string; voiceId?: string };

const addGeneratedSchema = z.object({
  url: z.string().min(1),
  description: z.string().default(""),
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
    columns: { id: true, characterImages: true },
  });
  if (!existing) return notFound("Series not found");

  const contentType = req.headers.get("content-type") || "";
  const currentImages = (existing.characterImages ?? []) as CharacterImage[];

  if (contentType.includes("application/json")) {
    const body = await req.json();
    const parsed = addGeneratedSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.message);

    const newEntry: CharacterImage = { url: parsed.data.url, description: parsed.data.description };
    if (parsed.data.voiceId) newEntry.voiceId = parsed.data.voiceId;
    const newImages = [...currentImages, newEntry];
    await db
      .update(series)
      .set({ characterImages: newImages, updatedAt: new Date() })
      .where(eq(series.id, id));

    return NextResponse.json({ characterImages: newImages });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) return badRequest("No file provided");

  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return badRequest("File must be JPEG, PNG, or WebP");
  }

  if (file.size > 10 * 1024 * 1024) {
    return badRequest("File must be under 10MB");
  }

  const index = currentImages.length;

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `series/${id}/character_${index}_${Date.now()}.${ext}`;

  await uploadFile(key, buffer, file.type);

  const newImages = [...currentImages, { url: key, description: "" }];

  await db
    .update(series)
    .set({ characterImages: newImages, updatedAt: new Date() })
    .where(eq(series.id, id));

  return NextResponse.json({ characterImages: newImages });
}

const updateDescSchema = z.object({
  index: z.number().int().min(0),
  description: z.string().optional(),
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
    columns: { id: true, characterImages: true },
  });
  if (!existing) return notFound("Series not found");

  const body = await req.json();
  const parsed = updateDescSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const images = [...((existing.characterImages ?? []) as CharacterImage[])];
  if (parsed.data.index >= images.length) return badRequest("Invalid index");

  const updates: Partial<CharacterImage> = {};
  if (parsed.data.description !== undefined) updates.description = parsed.data.description;
  if (parsed.data.voiceId !== undefined) updates.voiceId = parsed.data.voiceId ?? undefined;
  images[parsed.data.index] = { ...images[parsed.data.index], ...updates };

  await db
    .update(series)
    .set({ characterImages: images, updatedAt: new Date() })
    .where(eq(series.id, id));

  return NextResponse.json({ characterImages: images });
}

const deleteSchema = z.object({
  index: z.number().int().min(0),
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
    columns: { id: true, characterImages: true },
  });
  if (!existing) return notFound("Series not found");

  const body = await req.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.message);

  const images = [...((existing.characterImages ?? []) as CharacterImage[])];
  if (parsed.data.index >= images.length) return badRequest("Invalid index");

  images.splice(parsed.data.index, 1);

  await db
    .update(series)
    .set({ characterImages: images, updatedAt: new Date() })
    .where(eq(series.id, id));

  return NextResponse.json({ characterImages: images });
}
