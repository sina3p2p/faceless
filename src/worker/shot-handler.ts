import type { Job } from "bullmq";
import IORedis from "ioredis";
import { db, schema, eq } from "./shared";
import type { ShotJobData } from "@/lib/shot-queue";
import { shotEventsChannel } from "@/lib/shot-queue";
import { generateShotWithFallback } from "@/server/services/showrunner";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { logger } from "@/lib/logger";
import { REDIS } from "@/lib/constants";

// Separate Redis connection for publishing (BullMQ connection has maxRetriesPerRequest=null
// which is incompatible with subscribe/publish in some ioredis versions).
const publisher = new IORedis(REDIS.url, { maxRetriesPerRequest: null });

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
  try {
    const result = await generateShotWithFallback(
      referenceImageUrls,
      prompt,
      aspectRatio,
      duration,
      sessionId
    );

    // Download from Replicate and re-upload to R2 so the URL never expires.
    const videoResp = await fetch(result.videoUrl);
    const videoBuffer = Buffer.from(await videoResp.arrayBuffer());
    const key = `v2/shots/${sessionId}/${toolCallId}.mp4`;
    await uploadFile(key, videoBuffer, "video/mp4");
    videoUrl = mediaUrl(key);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Shot job generation failed", err as Error, { jobId: job.id, sessionId, toolCallId });

    await db
      .update(schema.filmShotJobs)
      .set({ status: "failed", error: errorMsg, updatedAt: new Date() })
      .where(eq(schema.filmShotJobs.toolCallId, toolCallId));

    // Patch the assistant message so the client sees an error state on reload.
    await patchMessageToolCall(assistantMessageRowId, toolCallId, { shotError: errorMsg, pending: false });

    // Notify the client so it stops waiting.
    await publisher.publish(
      shotEventsChannel(sessionId),
      JSON.stringify({ type: "shot_error", toolCallId, error: errorMsg })
    );
    throw err; // let BullMQ handle retries / failure logging
  }

  // Persist success.
  await db
    .update(schema.filmShotJobs)
    .set({ status: "succeeded", videoUrl, updatedAt: new Date() })
    .where(eq(schema.filmShotJobs.toolCallId, toolCallId));

  await patchMessageToolCall(assistantMessageRowId, toolCallId, { videoUrl, pending: false });

  // Push real-time notification to the client SSE endpoint.
  await publisher.publish(
    shotEventsChannel(sessionId),
    JSON.stringify({ type: "shot_complete", toolCallId, videoUrl })
  );

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
