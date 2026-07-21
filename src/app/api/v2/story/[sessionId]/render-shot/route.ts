import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db";
import { filmSessions, filmSessionMessages } from "@/server/db/schema";
import { getAuthUser, unauthorized, notFound, badRequest } from "@/lib/api-utils";
import { eq, and } from "drizzle-orm";
import { enqueueWorkerJob, JOB_NAMES } from "@/lib/worker-queue";
import {
  resolveHandles,
  unknownHandlesError,
} from "@/server/services/showrunner/handle-resolver";

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

  // Re-resolve handles at render time (fresh signed keys; approvals may have landed).
  const references = (storedArgs.references as Array<{ handle: string }> | undefined) ?? [];
  const audioRefs =
    (storedArgs.audio_references as Array<{ handle: string }> | undefined) ?? [];
  const imageHandles = references.map((r) => r.handle).filter(Boolean);
  const audioHandles = audioRefs.map((r) => r.handle).filter(Boolean);
  const sourceClip =
    (storedArgs.source_clip_handle as string | null | undefined)?.trim() || null;
  const allHandles = [
    ...imageHandles,
    ...audioHandles,
    ...(sourceClip ? [sourceClip] : []),
  ];

  let resolvedPatch: Record<string, unknown> = {};
  if (allHandles.length > 0) {
    const { keys, unknown } = await resolveHandles(sessionId, allHandles);
    if (unknown.length > 0) {
      const err = await unknownHandlesError(sessionId, unknown);
      return badRequest(err.errors.join("; "));
    }
    const imageKeys = keys.slice(0, imageHandles.length);
    const audioKeys = keys.slice(
      imageHandles.length,
      imageHandles.length + audioHandles.length
    );
    const sourceKey =
      sourceClip != null
        ? keys[imageHandles.length + audioHandles.length]
        : undefined;
    resolvedPatch = {
      resolvedReferenceUrls: imageKeys,
      resolvedAudioUrls: audioKeys,
      ...(sourceKey ? { resolvedSourceVideoUrl: sourceKey } : {}),
    };
    Object.assign(storedArgs, resolvedPatch);
  }

  const { toCompileShotArgs } = await import("@/server/services/showrunner/tools/compile-shot");
  const compiled = toCompileShotArgs({
    ...storedArgs,
    render_prompt: renderPrompt,
    prompt: renderPrompt,
  });
  if (!compiled) return badRequest("Invalid compile package");

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
        ? {
            ...tc,
            function: {
              ...tc.function,
              arguments: {
                ...tc.function.arguments,
                ...resolvedPatch,
                pending: true,
                render_prompt: renderPrompt,
                prompt: renderPrompt,
              },
            },
          }
        : tc
    );
    await db
      .update(filmSessionMessages)
      .set({ parts: [{ ...d, toolCalls: updatedCalls }] })
      .where(eq(filmSessionMessages.id, assistantRowId));
  }

  await enqueueWorkerJob(sessionId, JOB_NAMES.GENERATE_SHOT, {
    toolCallId,
    assistantMessageRowId: assistantRowId,
    referenceImageUrls: compiled.referenceImageUrls ?? [],
    referenceAudioUrls: compiled.referenceAudioUrls ?? [],
    prompt: renderPrompt,
    aspectRatio: compiled.aspectRatio ?? "16:9",
    duration: compiled.duration,
    continuityMode: compiled.continuityMode ?? "fresh",
    sourceVideoUrl: compiled.sourceVideoUrl,
  });

  return NextResponse.json({ ok: true, queued: true });
}
