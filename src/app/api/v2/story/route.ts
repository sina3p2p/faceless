import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, badRequest } from "@/lib/api-utils";
import { eq, desc, asc, and, inArray } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const body = await req.json().catch(() => null);
  if (!body?.message || typeof body.message !== "string") return badRequest("message is required");

  const message = body.message.trim();
  if (message.length < 5) return badRequest("message must be at least 5 characters");
  if (message.length > 500) return badRequest("message must be under 500 characters");

  const [session] = await db
    .insert(filmSessions)
    .values({ userId: user.id, status: "in_progress" })
    .returning();

  const msgId = crypto.randomUUID();
  await db.insert(filmSessionMessages).values({
    id: crypto.randomUUID(),
    messageId: msgId,
    sessionId: session.id,
    role: "user",
    type: "text",
    parts: [{ text: message }],
    createdAt: new Date(),
  });

  return NextResponse.json({ sessionId: session.id });
}

export async function GET(_req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const sessions = await db
    .select({
      id: filmSessions.id,
      status: filmSessions.status,
      title: filmSessions.title,
      createdAt: filmSessions.createdAt,
      updatedAt: filmSessions.updatedAt,
    })
    .from(filmSessions)
    .where(eq(filmSessions.userId, user.id))
    .orderBy(desc(filmSessions.updatedAt))
    .limit(20);

  const sessionIds = sessions.map((s) => s.id);
  const seedBySession: Record<string, string> = {};

  if (sessionIds.length > 0) {
    const firstMessages = await db
      .select({ sessionId: filmSessionMessages.sessionId, parts: filmSessionMessages.parts })
      .from(filmSessionMessages)
      .where(
        and(
          inArray(filmSessionMessages.sessionId, sessionIds),
          eq(filmSessionMessages.role, "user"),
          eq(filmSessionMessages.type, "text")
        )
      )
      .orderBy(asc(filmSessionMessages.createdAt));

    for (const msg of firstMessages) {
      if (!seedBySession[msg.sessionId]) {
        const parts = msg.parts as Array<{ text?: string }>;
        seedBySession[msg.sessionId] = parts[0]?.text ?? "";
      }
    }
  }

  return NextResponse.json({
    sessions: sessions.map((s) => ({ ...s, seed: seedBySession[s.id] ?? null })),
  });
}
