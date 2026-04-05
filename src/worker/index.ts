import { Worker } from "bullmq";
import IORedis from "ioredis";
import { renderVideoJob } from "./renderJob";
import { RENDER_QUEUE_NAME } from "@/lib/constants";
import { logger } from "@/lib/logger";

process.env.SERVICE_NAME = "faceless-worker";

const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null }
);

const worker = new Worker(
  RENDER_QUEUE_NAME,
  async (job) => {
    const startTime = Date.now();
    logger.info("Job started", { jobId: job.id, jobName: job.name, data: job.data });
    await renderVideoJob(job);
    logger.info("Job completed", {
      jobId: job.id,
      durationMs: Date.now() - startTime,
    });
  },
  {
    connection,
    concurrency: 2,
    limiter: { max: 4, duration: 60_000 },
  }
);

worker.on("completed", (job) => {
  logger.info("Job finished successfully", { jobId: job.id });
});

worker.on("failed", (job, err) => {
  logger.error("Job failed", err, {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
  });
});

worker.on("error", (err) => {
  logger.error("Worker error", err);
});

logger.info("Worker started", { queue: RENDER_QUEUE_NAME });

async function gracefulShutdown() {
  logger.info("Worker shutting down gracefully");
  await worker.close();
  await connection.quit();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
