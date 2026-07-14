import { db, schema, eq } from "./shared";

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

export async function patchMessageToolCall(
  assistantMessageRowId: string,
  toolCallId: string,
  patch: Record<string, unknown>,
) {
  const [row] = await db
    .select()
    .from(schema.filmSessionMessages)
    .where(eq(schema.filmSessionMessages.id, assistantMessageRowId));

  if (!row) return;

  const d = ((row.parts as unknown[])[0] ?? {}) as Record<string, unknown>;
  const calls = (Array.isArray(d.toolCalls) ? d.toolCalls : []) as StoredTc[];
  const updatedCalls = calls.map((tc) =>
    tc.id === toolCallId
      ? { ...tc, function: { ...tc.function, arguments: { ...tc.function.arguments, ...patch } } }
      : tc
  );

  await db
    .update(schema.filmSessionMessages)
    .set({ parts: [{ ...d, toolCalls: updatedCalls }] })
    .where(eq(schema.filmSessionMessages.id, assistantMessageRowId));
}

export async function setJobStatus(
  jobId: string,
  status: "pending" | "in_progress" | "succeeded" | "failed",
  result?: Record<string, unknown> | null,
) {
  await db
    .update(schema.workerJobs)
    .set({
      status,
      ...(result !== undefined ? { result } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.workerJobs.id, jobId));
}
