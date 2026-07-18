import { Queue } from "bullmq";
import { redis } from "./redis";
import { db } from "@/server/db";
import { workerJobs } from "@/server/db/schema";

export const WORKER_QUEUE_NAME = "worker-jobs";

export const JOB_NAMES = {
  GENERATE_SHOT: "generate-shot",
  GENERATE_ASSET_IMAGES: "generate-asset-images",
  GENERATE_GENERATION_GRID: "generate-generation-grid",
} as const;

export type WorkerJobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface WorkerQueueJobData {
  jobId: string;
}

/** Common fields every job payload must include so the worker can patch the message. */
export interface WorkerJobPayloadBase {
  toolCallId: string;
  assistantMessageRowId: string;
}

export const workerQueue = new Queue<WorkerQueueJobData>(WORKER_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

/** Insert a worker_jobs row and enqueue it on BullMQ. Returns the job id. */
export async function enqueueWorkerJob(
  sessionId: string,
  jobName: WorkerJobName,
  payload: WorkerJobPayloadBase & Record<string, unknown>,
): Promise<string> {
  const jobId = crypto.randomUUID();
  const now = new Date();

  await db.insert(workerJobs).values({
    id: jobId,
    sessionId,
    jobName,
    payload,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await workerQueue.add(jobName, { jobId }, { jobId });

  return jobId;
}
