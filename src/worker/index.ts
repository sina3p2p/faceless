import { Worker } from "bullmq";
import IORedis from "ioredis";
import { logger } from "@/lib/logger";
import { REDIS } from "@/lib/constants";
import { SHOT_QUEUE_NAME } from "@/lib/shot-queue";
import { handleShotJob } from "./shot-handler";
import type { ShotJobData } from "@/lib/shot-queue";

process.env.SERVICE_NAME = "faceless-worker";

const connection = new IORedis(REDIS.url, {
  maxRetriesPerRequest: null,
});

// ── Shot-generation worker ────────────────────────────────────────────────────
const shotConnection = new IORedis(REDIS.url, { maxRetriesPerRequest: null });

const shotWorker = new Worker<ShotJobData>(
  SHOT_QUEUE_NAME,
  async (job) => {
    await handleShotJob(job);
  },
  {
    connection: shotConnection,
    concurrency: 3, // allow up to 3 shots to generate in parallel
  }
);

shotWorker.on("completed", (job) => {
  logger.info("Shot job finished", { jobId: job.id });
});

shotWorker.on("failed", (job, err) => {
  logger.error("Shot job failed", err, { jobId: job?.id });
});

logger.info("Shot worker started", { queue: SHOT_QUEUE_NAME });

async function gracefulShutdown() {
  logger.info("Worker shutting down gracefully");
  await shotWorker.close();
  await connection.quit();
  await shotConnection.quit();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
