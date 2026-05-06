import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { media } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, desc, and, count } from "drizzle-orm";
import { mediaUrl } from "@/lib/storage";

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

  const items = mediaItems.map((item) => ({
    id: item.id,
    type: item.type,
    url: mediaUrl(item.url),
    prompt: item.prompt,
    model: item.modelUsed,
    createdAt: item.createdAt.toISOString(),
  }));

  return NextResponse.json({ items, total, page, limit });
}
