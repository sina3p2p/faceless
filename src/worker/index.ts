import { Worker } from "bullmq";
import IORedis from "ioredis";
import { generateImagesJob } from "./mediaJobs";
import { rerenderVideoJob, renderFromScenesJob } from "./renderJobs";
import {
  executiveProduceJob,
  generateStoryJob,
  splitScenesJob,
  superviseScriptJob,
  generateTTSJob,
  cinematographyJob,
  storyboardJob,
  generatePromptsJob,
  generateFrameImagesJob,
  generateMotionJob as pipelineGenerateMotionJob,
  generateFrameVideosJob,
  composeFinalJob,
} from "./pipelineJobs";
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
    if (job.name === "executive-produce") {
      await executiveProduceJob(job);
    } else if (job.name === "generate-story") {
      await generateStoryJob(job);
    } else if (job.name === "split-scenes") {
      await splitScenesJob(job);
    } else if (job.name === "supervise-script") {
      await superviseScriptJob(job);
    } else if (job.name === "generate-tts") {
      await generateTTSJob(job);
    } else if (job.name === "cinematography") {
      await cinematographyJob(job);
    } else if (job.name === "storyboard") {
      await storyboardJob(job);
    } else if (job.name === "generate-prompts") {
      await generatePromptsJob(job);
    } else if (job.name === "generate-frame-images") {
      await generateFrameImagesJob(job);
    } else if (job.name === "generate-pipeline-motion") {
      await pipelineGenerateMotionJob(job);
    } else if (job.name === "generate-frame-videos") {
      await generateFrameVideosJob(job);
    } else if (job.name === "compose-final") {
      await composeFinalJob(job);
    } else if (job.name === "generate-images") {
      await generateImagesJob(job);
    } else if (job.name === "render-from-scenes") {
      await renderFromScenesJob(job);
    } else if (job.name === "rerender-video") {
      await rerenderVideoJob(job);
    } else {
      logger.warn("Skipping unknown/removed job", { jobName: job.name, jobId: job.id });
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
