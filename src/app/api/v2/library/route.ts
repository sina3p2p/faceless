import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { media } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, desc, and } from "drizzle-orm";
import { mediaUrl } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 18)));

  const rows = await db
    .select({
      id: media.id,
      url: media.url,
      createdAt: media.createdAt,
      metadata: media.metadata,
    })
    .from(media)
    .where(and(eq(media.userId, user.id), eq(media.type, "video")))
    .orderBy(desc(media.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const items = await Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      videoUrl: await mediaUrl(r.url),
      duration: (r.metadata as { duration?: number } | null)?.duration,
      createdAt: r.createdAt,
    }))
  );

  const hasMore = items.length > limit;
  return NextResponse.json({ shots: items.slice(0, limit), hasMore });
}
