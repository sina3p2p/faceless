import type { Job } from "bullmq";
import { db, schema, eq } from "./shared";
import type { ShotJobData } from "@/lib/shot-queue";
import { renderAndUploadShot } from "@/server/services/showrunner";
import { logger } from "@/lib/logger";

type StoredTc = {
  id: string;
  type: "function";
  function: { name: string; arguments: Record<string, unknown> };
};

export async function handleShotJob(job: Job<ShotJobData>) {
  const {
    sessionId,
    toolCallId,
    assistantMessageRowId,
    referenceImageUrls,
    prompt,
    aspectRatio,
    duration,
  } = job.data;

  logger.info("Shot job started", { jobId: job.id, sessionId, toolCallId });

  await db
    .update(schema.filmShotJobs)
    .set({ status: "in_progress", updatedAt: new Date() })
    .where(eq(schema.filmShotJobs.toolCallId, toolCallId));

  let videoUrl: string;
  let durationSeconds: number;
  let mediaId: string;
  try {
    const key = `v2/shots/${sessionId}/${toolCallId}.mp4`;
    ({ url: videoUrl, durationSeconds, mediaId } = await renderAndUploadShot(referenceImageUrls, prompt, aspectRatio, duration, sessionId, key));
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Shot job generation failed", err as Error, { jobId: job.id, sessionId, toolCallId });

    await db
      .update(schema.filmShotJobs)
      .set({ status: "failed", error: errorMsg, updatedAt: new Date() })
      .where(eq(schema.filmShotJobs.toolCallId, toolCallId));

    // Patch the assistant message so the client sees an error state on reload.
    await patchMessageToolCall(assistantMessageRowId, toolCallId, { shotError: errorMsg, pending: false });

    throw err; // let BullMQ handle retries / failure logging
  }

  // Persist success. The /shot-events SSE route polls filmShotJobs (joined
  // to `media` for the URL) and will push the result to the client within
  // the next poll cycle (~3 s).
  await db
    .update(schema.filmShotJobs)
    .set({ status: "succeeded", mediaId, updatedAt: new Date() })
    .where(eq(schema.filmShotJobs.toolCallId, toolCallId));

  await patchMessageToolCall(assistantMessageRowId, toolCallId, { videoUrl, renderedDurationSeconds: durationSeconds, pending: false });

  logger.info("Shot job completed", { jobId: job.id, sessionId, toolCallId, videoUrl });
  return { videoUrl };
}

async function patchMessageToolCall(
  assistantMessageRowId: string,
  toolCallId: string,
  patch: Record<string, unknown>
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
