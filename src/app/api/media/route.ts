import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { media } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, desc, and, count } from "drizzle-orm";
import { getSignedDownloadUrl } from "@/lib/storage";

const PAGE_SIZE = 20;

interface MediaItem {
  id: string;
  type: "video" | "image" | "audio";
  url: string;
  videoTitle: string | null;
  seriesName: string;
  sceneIndex: number;
  prompt: string | null;
  model: string | null;
  createdAt: string;
}

const resolveUrl = async (key: string | null) => {
  if (!key) return null;
  if (key.startsWith("http")) return key;
  return getSignedDownloadUrl(key);
};

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const tab = (searchParams.get("tab") || "images") as "videos" | "images" | "audio";
  const page = Number(searchParams.get("page")) || 0;
  const limit = Math.min(Number(searchParams.get("limit")) || PAGE_SIZE, 50);

  const userCondition = eq(media.userId, user.id);
  const condition = tab ? and(eq(media.type, tab), userCondition) : userCondition;
  const [result] = await db.select({ count: count() }).from(media).where(condition);
  const total = result?.count ?? 0;

  const mediaItems = await db.query.media.findMany({
    where: condition,
    columns: { id: true, type: true, url: true, prompt: true, modelUsed: true, createdAt: true },
    orderBy: desc(media.createdAt),
    limit: limit,
    offset: page * limit,
  });

  const items = await Promise.all(mediaItems.map(async (item) => ({
    id: item.id,
    type: item.type,
    url: await resolveUrl(item.url),
    prompt: item.prompt,
    model: item.modelUsed,
    createdAt: item.createdAt.toISOString(),
  })));

  return NextResponse.json({ items, total, page, limit });
}
