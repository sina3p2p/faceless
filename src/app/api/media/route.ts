import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { media } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { eq, desc, and, count } from "drizzle-orm";
import { mediaUrl, uploadFile } from "@/lib/storage";
import { probeVideoDuration } from "@/lib/media-probe";

function durationOf(item: { metadata: unknown }): number | null {
  return (item.metadata as { duration?: number } | null)?.duration ?? null;
}

const PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const tab = (searchParams.get("tab") || "image") as "video" | "image" | "audio";
  const page = Number(searchParams.get("page")) || 0;
  const limit = Math.min(Number(searchParams.get("limit")) || PAGE_SIZE, 50);

  const where = and(eq(media.type, tab), eq(media.userId, user.id));
  const [result] = await db.select({ count: count() }).from(media).where(where);
  const total = result?.count ?? 0;

  const mediaItems = await db.query.media.findMany({
    where,
    orderBy: desc(media.createdAt),
    limit: limit,
    offset: page * limit,
  });

  const items = await Promise.all(
    mediaItems.map(async (item) => ({
      id: item.id,
      type: item.type,
      url: await mediaUrl(item.url),
      prompt: item.prompt,
      model: item.modelUsed,
      duration: durationOf(item),
      createdAt: item.createdAt.toISOString(),
    }))
  );

  return NextResponse.json({ items, total, totalPages: Math.ceil(total / limit), page, limit });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return badRequest("No file provided");

  const type =
    file.type.startsWith("video/") ? "video" :
    file.type.startsWith("audio/") ? "audio" :
    file.type.startsWith("image/") ? "image" :
    null;
  if (!type) return badRequest("Unsupported file type");

  const MAX_BYTES = type === "video" ? 500_000_000 : type === "audio" ? 100_000_000 : 20_000_000;
  if (file.size > MAX_BYTES) return badRequest(`File exceeds ${MAX_BYTES / 1_000_000}MB limit`);

  const ext = file.name.split(".").pop()?.toLowerCase() ?? (type === "video" ? "mp4" : type === "audio" ? "mp3" : "jpg");
  const key = `uploads/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadFile(key, buffer, file.type);

  const duration = type === "video" ? await probeVideoDuration(buffer) : null;

  const [item] = await db.insert(media).values({
    userId: user.id,
    type,
    url: key,
    prompt: file.name,
    modelUsed: "upload",
    metadata: duration != null ? { duration } : null,
  }).returning();

  return NextResponse.json(
    {
      id: item.id,
      type: item.type,
      url: await mediaUrl(item.url),
      prompt: item.prompt,
      model: item.modelUsed,
      duration: durationOf(item),
      createdAt: item.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
