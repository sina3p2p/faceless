import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { loadMessagesPage } from "@/server/services/showrunner/messages";

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

  const page = await loadMessagesPage(sessionId, before);
  return NextResponse.json(page);
}
