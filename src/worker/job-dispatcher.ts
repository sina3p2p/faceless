import { type WorkerJobName } from "@/lib/worker-queue";
import { logger } from "@/lib/logger";
import { patchMessageToolCall, setJobStatus } from "./job-helpers";
import { workerJobs, type PayloadBase } from "./jobs";

export async function dispatchWorkerJob(
  jobId: string,
  jobName: string,
  sessionId: string,
  payload: Record<string, unknown>,
) {
  const handler = workerJobs[jobName as WorkerJobName];
  if (!handler) {
    throw new Error(`Unknown job name: ${jobName}`);
  }

  const { toolCallId, assistantMessageRowId } = payload as PayloadBase;

  logger.info("Worker job started", { jobId, jobName, sessionId, toolCallId });
  await setJobStatus(jobId, "in_progress");

  try {
    await handler.run({ jobId, sessionId, toolCallId, assistantMessageRowId, payload });
    logger.info("Worker job completed", { jobId, jobName, sessionId, toolCallId });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Worker job failed", err as Error, { jobId, jobName, sessionId, toolCallId });

    await setJobStatus(jobId, "failed", { error: errorMsg });
    await patchMessageToolCall(assistantMessageRowId, toolCallId, handler.failPatch(errorMsg));
    throw err;
  }
}
