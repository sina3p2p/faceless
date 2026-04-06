import { Worker } from "bullmq";
import IORedis from "ioredis";
import { renderVideoJob, rerenderVideoJob, generateScriptJob, renderFromScenesJob, generateMusicScriptJob, renderMusicVideoJob } from "./renderJob";
import { RENDER_QUEUE_NAME } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { REDIS, WORKER } from "@/lib/constants";

process.env.SERVICE_NAME = "faceless-worker";

const connection = new IORedis(REDIS.url, {
  maxRetriesPerRequest: null,
});

const worker = new Worker(
  RENDER_QUEUE_NAME,
  async (job) => {
    const startTime = Date.now();
    logger.info("Job started", { jobId: job.id, jobName: job.name, data: job.data });
    if (job.name === "generate-script") {
      await generateScriptJob(job);
    } else if (job.name === "generate-music-script") {
      await generateMusicScriptJob(job);
    } else if (job.name === "render-from-scenes") {
      await renderFromScenesJob(job);
    } else if (job.name === "render-music-video") {
      await renderMusicVideoJob(job);
    } else if (job.name === "rerender-video") {
      await rerenderVideoJob(job);
    } else {
      await renderVideoJob(job);
    }
    logger.info("Job completed", {
      jobId: job.id,
      durationMs: Date.now() - startTime,
    });
  },
  {
    connection,
    concurrency: WORKER.concurrency,
    limiter: { max: WORKER.limiterMax, duration: WORKER.limiterDuration },
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
