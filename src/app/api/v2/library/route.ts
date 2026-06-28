import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmShotJobs, filmSessions } from "@/server/db/schema";
import { getAuthUser, unauthorized } from "@/lib/api-utils";
import { eq, desc, and, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 18)));

  const shots = await db
    .select({
      toolCallId: filmShotJobs.toolCallId,
      videoUrl: filmShotJobs.videoUrl,
      sessionId: filmShotJobs.sessionId,
      createdAt: filmShotJobs.createdAt,
    })
    .from(filmShotJobs)
    .innerJoin(filmSessions, eq(filmShotJobs.sessionId, filmSessions.id))
    .where(
      and(
        eq(filmSessions.userId, user.id),
        eq(filmShotJobs.status, "succeeded"),
        isNotNull(filmShotJobs.videoUrl),
      ),
    )
    .orderBy(desc(filmShotJobs.createdAt))
    .limit(limit + 1)
    .offset(offset);

  const hasMore = shots.length > limit;
  return NextResponse.json({ shots: shots.slice(0, limit), hasMore });
}
