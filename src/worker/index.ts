import { Worker } from "bullmq";
import IORedis from "ioredis";
import {
  executiveProduceJob,
  webResearchJob,
  generateStoryJob,
  splitScenesJob,
  superviseScriptJob,
  generateTTSJob,
  cinematographyJob,
  extractHeroAssetsJob,
  storyboardJob,
  generatePromptsJob,
  generateFrameImagesJob,
  generateMotionJob as pipelineGenerateMotionJob,
  generateFrameVideosJob,
  composeFinalJob,
  timelapsePlanJob,
} from "./pipeline";
import {
  isPipelineJob,
  nextStep,
  resolveVideoType,
  type JobName,
} from "./pipeline/topology";
import { db, schema, eq, updateVideoStatus } from "./shared";
import { renderQueue } from "@/lib/queue";
import { RENDER_QUEUE_NAME } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { REDIS, WORKER } from "@/lib/constants";
import { withAiAuditContext } from "@/server/services/ai-audit";

process.env.SERVICE_NAME = "faceless-worker";

const connection = new IORedis(REDIS.url, {
  maxRetriesPerRequest: null,
});

const HANDLERS: Record<JobName, (job: import("bullmq").Job) => Promise<void>> = {
  "executive-produce": executiveProduceJob,
  "web-research": webResearchJob,
  "generate-story": generateStoryJob,
  "split-scenes": splitScenesJob,
  "supervise-script": superviseScriptJob,
  "generate-tts": generateTTSJob,
  "cinematography": cinematographyJob,
  "extract-hero-assets": extractHeroAssetsJob,
  "storyboard": storyboardJob,
  "generate-prompts": generatePromptsJob,
  "generate-frame-images": generateFrameImagesJob,
  "generate-pipeline-motion": pipelineGenerateMotionJob,
  "generate-frame-videos": generateFrameVideosJob,
  "compose-final": composeFinalJob,
  "timelapse-plan": timelapsePlanJob,
};

/**
 * After a stage completes the runner — not the worker — decides what happens
 * next, by asking the declarative topology (./pipeline/topology). The worker
 * just did its work; routing, conditional steps, and review gates all live in
 * one place now.
 */
async function advancePipeline(videoProjectId: string, currentJob: JobName) {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { videoType: true, config: true },
  });
  if (!project) return;

  const ctx = {
    videoType: resolveVideoType(project.videoType),
    config: project.config ?? {},
  };
  const step = nextStep(ctx, currentJob);

  if (step.kind === "enqueue") {
    await renderQueue.add(step.job, { videoProjectId });
    logger.info("Pipeline advanced", {
      videoProjectId,
      from: currentJob,
      to: step.job,
    });
  } else if (step.kind === "review") {
    await updateVideoStatus(videoProjectId, step.status);
    logger.info("Pipeline paused for review", {
      videoProjectId,
      from: currentJob,
      status: step.status,
    });
  } else {
    logger.info("Pipeline complete", { videoProjectId, from: currentJob });
  }
}

const worker = new Worker(
  RENDER_QUEUE_NAME,
  async (job) => {
    const startTime = Date.now();
    logger.info("Job started", { jobId: job.id, jobName: job.name, data: job.data });
    const videoProjectId =
      typeof (job.data as { videoProjectId?: unknown })?.videoProjectId === "string"
        ? ((job.data as { videoProjectId: string }).videoProjectId)
        : undefined;
    await withAiAuditContext(
      { videoProjectId, bullmqJobId: job.id ? String(job.id) : undefined },
      async () => {
        if (!isPipelineJob(job.name)) {
          logger.warn("Skipping unknown/removed job", { jobName: job.name, jobId: job.id });
          return;
        }

        await HANDLERS[job.name](job);

        // Stage succeeded — the runner owns the transition. On throw, the
        // handler's catch already failed the job and rethrew, so we never
        // reach here and never advance a failed pipeline.
        if (videoProjectId) {
          await advancePipeline(videoProjectId, job.name);
        }
      },
    );
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
