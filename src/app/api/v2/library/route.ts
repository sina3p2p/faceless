import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmShotJobs, filmSessions, media } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, desc, and, isNotNull } from "drizzle-orm";
import { mediaUrl } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 18)));

  const shots = await db
    .select({
      toolCallId: filmShotJobs.toolCallId,
      mediaUrl: media.url,
      sessionId: filmShotJobs.sessionId,
      createdAt: filmShotJobs.createdAt,
    })
    .from(filmShotJobs)
    .innerJoin(filmSessions, eq(filmShotJobs.sessionId, filmSessions.id))
    .innerJoin(media, eq(filmShotJobs.mediaId, media.id))
    .where(
      and(
        eq(filmSessions.userId, user.id),
        eq(filmShotJobs.status, "succeeded"),
        isNotNull(filmShotJobs.mediaId),
      ),
    )
    .orderBy(desc(filmShotJobs.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const items = shots.map((s) => ({
    toolCallId: s.toolCallId,
    videoUrl: mediaUrl(s.mediaUrl),
    sessionId: s.sessionId,
    createdAt: s.createdAt,
  }));

  const hasMore = items.length > limit;
  return NextResponse.json({ shots: items.slice(0, limit), hasMore });
}
