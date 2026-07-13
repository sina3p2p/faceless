import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound } from "@/lib/api-utils";
import { eq } from "drizzle-orm";
import { generateSessionTitle } from "@/server/services/showrunner/generate-session-title";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;

  const [session] = await db
    .select({ id: filmSessions.id, userId: filmSessions.userId, title: filmSessions.title })
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId))
    .limit(1);

  if (!session || session.userId !== user.id) return notFound("Session not found");

  if (session.title) {
    return NextResponse.json({ title: session.title });
  }

  const title = await generateSessionTitle(sessionId);
  return NextResponse.json({ title });
}
