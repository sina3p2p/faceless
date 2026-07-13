import { eq, isNull, and, asc } from "drizzle-orm";
import { generateText } from "@/server/services/ai-audit";
import { openrouter } from "@/server/services/ai/llm";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { logger } from "@/lib/logger";

const TITLE_MODEL = "openai/gpt-4.1-mini" as const;

function cleanTitle(raw: string): string {
  return raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function generateSessionTitle(sessionId: string): Promise<string | null> {
  try {
    const [session] = await db
      .select({ title: filmSessions.title })
      .from(filmSessions)
      .where(eq(filmSessions.id, sessionId))
      .limit(1);

    if (!session) return null;
    if (session.title) return session.title;

    const [firstMessage] = await db
      .select({ parts: filmSessionMessages.parts })
      .from(filmSessionMessages)
      .where(
        and(
          eq(filmSessionMessages.sessionId, sessionId),
          eq(filmSessionMessages.role, "user"),
          eq(filmSessionMessages.type, "text")
        )
      )
      .orderBy(asc(filmSessionMessages.createdAt))
      .limit(1);

    const parts = firstMessage?.parts as Array<{ text?: string }> | undefined;
    const firstPrompt = parts?.[0]?.text?.trim();
    if (!firstPrompt) return null;

    const { text } = await generateText({
      model: openrouter.chat(TITLE_MODEL),
      temperature: 1,
      prompt: `Generate a short story title (3–6 words) for this idea. Reply with the title only — no quotes, punctuation fluff, or explanation.\n\nIdea: ${firstPrompt}`,
    });

    const title = cleanTitle(text);
    if (!title) return null;

    await db
      .update(filmSessions)
      .set({ title })
      .where(and(eq(filmSessions.id, sessionId), isNull(filmSessions.title)));

    return title;
  } catch (err) {
    logger.warn("session title generation failed", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
