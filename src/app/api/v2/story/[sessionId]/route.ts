import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq, asc } from "drizzle-orm";
import { rowsToClientMessages } from "@/server/services/showrunner/messages";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;

  const [session] = await db
    .select()
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== user.id) return notFound("Session not found");

  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.sessionId, sessionId))
    .orderBy(asc(filmSessionMessages.createdAt));

  const messages = rowsToClientMessages(rows);

  return NextResponse.json({
    id: session.id,
    status: session.status,
    title: session.title ?? null,
    messages,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  });
}
