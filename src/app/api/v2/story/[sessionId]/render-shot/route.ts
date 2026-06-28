import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages, filmShotJobs } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { shotQueue } from "@/lib/shot-queue";

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { sessionId } = await params;
  const body = await req.json() as Record<string, unknown>;
  const toolCallId = body.toolCallId as string | undefined;
  const renderPrompt = body.renderPrompt as string | undefined;

  if (!toolCallId) return badRequest("toolCallId required");
  if (!renderPrompt?.trim()) return badRequest("renderPrompt required");

  const [session] = await db
    .select()
    .from(filmSessions)
    .where(eq(filmSessions.id, sessionId));

  if (!session || session.userId !== user.id) return notFound("Session not found");

  // Find the assistant message row that contains this compileShot tool call.
  const rows = await db
    .select()
    .from(filmSessionMessages)
    .where(
      and(
        eq(filmSessionMessages.sessionId, sessionId),
        eq(filmSessionMessages.role, "assistant"),
        eq(filmSessionMessages.type, "turn")
      )
    );

  let assistantRowId: string | null = null;
  let storedArgs: Record<string, unknown> | null = null;

  for (const row of rows) {
    const d = ((row.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
    const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
    for (const tc of calls) {
      if (tc.id === toolCallId && tc.function.name === "compileShot") {
        assistantRowId = row.id;
        storedArgs = tc.function.arguments;
        break;
      }
    }
    if (assistantRowId) break;
  }

  if (!assistantRowId || !storedArgs) return notFound("Shot compile not found");

  // Patch the stored tool call: mark pending so the client shows a loading state
  // on reload, and record the actual prompt that will be rendered (may differ if
  // the user edited it).
  const [msgRow] = await db
    .select()
    .from(filmSessionMessages)
    .where(eq(filmSessionMessages.id, assistantRowId));

  if (msgRow) {
    const d = ((msgRow.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
    const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
    const updatedCalls = calls.map((tc) =>
      tc.id === toolCallId
        ? { ...tc, function: { ...tc.function, arguments: { ...tc.function.arguments, pending: true, prompt: renderPrompt } } }
        : tc
    );
    await db
      .update(filmSessionMessages)
      .set({ parts: [{ ...d, toolCalls: updatedCalls }] })
      .where(eq(filmSessionMessages.id, assistantRowId));
  }

  // Create the job tracker row and enqueue the render.
  await db.insert(filmShotJobs).values({
    id: crypto.randomUUID(),
    sessionId,
    toolCallId,
    assistantMessageRowId: assistantRowId,
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await shotQueue.add("generate-shot", {
    sessionId,
    toolCallId,
    assistantMessageRowId: assistantRowId,
    referenceImageUrls: storedArgs.referenceImageUrls as string[],
    prompt: renderPrompt,
    aspectRatio: (storedArgs.aspectRatio as "16:9" | "9:16" | "1:1") ?? "16:9",
    duration: storedArgs.duration as number,
  });

  return NextResponse.json({ ok: true });
}
