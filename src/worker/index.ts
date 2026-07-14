import { Worker } from "bullmq";
import IORedis from "ioredis";
import { logger } from "@/lib/logger";
import { REDIS } from "@/lib/constants";
import { WORKER_QUEUE_NAME, type WorkerQueueJobData } from "@/lib/worker-queue";
import { db, schema, eq } from "./shared";
import { dispatchWorkerJob } from "./job-dispatcher";

process.env.SERVICE_NAME = "faceless-worker";

const connection = new IORedis(REDIS.url, {
  maxRetriesPerRequest: null,
});

const worker = new Worker<WorkerQueueJobData>(
  WORKER_QUEUE_NAME,
  async (job) => {
    const { jobId } = job.data;
    const [row] = await db
      .select()
      .from(schema.workerJobs)
      .where(eq(schema.workerJobs.id, jobId));

    if (!row) {
      throw new Error(`worker_jobs row not found: ${jobId}`);
    }

    await dispatchWorkerJob(
      row.id,
      row.jobName,
      row.sessionId,
      row.payload as Record<string, unknown>,
    );
  },
  {
    connection,
    concurrency: 3,
  },
);

worker.on("completed", (job) => {
  logger.info("Worker job finished", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  logger.error("Worker job failed", err, { jobId: job?.id });
});

logger.info("Worker started", { queue: WORKER_QUEUE_NAME });

async function gracefulShutdown() {
  logger.info("Worker shutting down gracefully");
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
