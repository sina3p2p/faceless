import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, lt, and, desc, asc } from "drizzle-orm";
import { rowsToClientMessages } from "@/server/services/showrunner/messages";

const PAGE_SIZE = 30;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;
  const before = req.nextUrl.searchParams.get("before");

  const [session] = await db
    .select({ id: filmSessions.id, userId: filmSessions.userId })
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== user.id) return notFound("Session not found");

  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(
      and(
        eq(filmSessionMessages.sessionId, sessionId),
        before ? lt(filmSessionMessages.createdAt, new Date(before)) : undefined
      )
    )
    .orderBy(desc(filmSessionMessages.createdAt))
    .limit(PAGE_SIZE * 3);

  const chronological = [...rows].reverse();
  const messages = rowsToClientMessages(chronological);
  const pageMessages = messages.slice(-PAGE_SIZE);
  const hasMore = messages.length > PAGE_SIZE || rows.length >= PAGE_SIZE * 3;
  const oldestCreatedAt = chronological[0]?.createdAt.toISOString() ?? null;

  return NextResponse.json({ messages: pageMessages, hasMore, oldestCreatedAt });
}
