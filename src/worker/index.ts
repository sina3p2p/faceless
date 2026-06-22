import { Worker } from "bullmq";
import IORedis from "ioredis";
import { STAGE_REGISTRY } from "./pipeline";
import {
  isPipelineStage,
  nextStep,
  resolveVideoType,
  resolveModelFamily,
  type StageName,
} from "./pipeline/topology";
import { db, schema, eq, updateVideoStatus } from "./shared";
import { renderQueue } from "@/lib/queue";
import { RENDER_QUEUE_NAME } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { REDIS, WORKER } from "@/lib/constants";
import { withAiAuditContext } from "@/server/services/ai-audit";
import { SHOT_QUEUE_NAME } from "@/lib/shot-queue";
import { handleShotJob } from "./shot-handler";
import type { ShotJobData } from "@/lib/shot-queue";

process.env.SERVICE_NAME = "faceless-worker";

const connection = new IORedis(REDIS.url, {
  maxRetriesPerRequest: null,
});

async function advancePipeline(videoProjectId: string, currentStage: StageName) {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { videoType: true, config: true, modelSettings: true },
  });
  if (!project) return;

  const ctx = {
    videoType: resolveVideoType(project.videoType),
    modelFamily: resolveModelFamily(
      (project.modelSettings as { videoModel?: string } | null)?.videoModel ?? ""
    ),
    config: project.config ?? {},
  };
  const step = nextStep(ctx, currentStage);

  if (step.kind === "enqueue") {
    await renderQueue.add(step.job, { videoProjectId });
    logger.info("Pipeline advanced", { videoProjectId, from: currentStage, to: step.job });
  } else if (step.kind === "review") {
    await updateVideoStatus(videoProjectId, step.status);
    logger.info("Pipeline paused for review", {
      videoProjectId,
      from: currentStage,
      status: step.status,
    });
  } else {
    logger.info("Pipeline complete", { videoProjectId, from: currentStage });
  }
}

const worker = new Worker(
  RENDER_QUEUE_NAME,
  async (job) => {
    const startTime = Date.now();
    logger.info("Job started", { jobId: job.id, jobName: job.name, data: job.data });
    const videoProjectId =
      typeof (job.data as { videoProjectId?: unknown })?.videoProjectId === "string"
        ? (job.data as { videoProjectId: string }).videoProjectId
        : undefined;

    await withAiAuditContext(
      { videoProjectId, bullmqJobId: job.id ? String(job.id) : undefined },
      async () => {
        if (!isPipelineStage(job.name)) {
          logger.warn("Skipping unknown/removed job", { jobName: job.name, jobId: job.id });
          return;
        }

        await STAGE_REGISTRY[job.name](job);

        if (videoProjectId) {
          await advancePipeline(videoProjectId, job.name);
        }
      }
    );
    logger.info("Job completed", { jobId: job.id, durationMs: Date.now() - startTime });
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
  logger.error("Job failed", err, { jobId: job?.id, attemptsMade: job?.attemptsMade });
});

worker.on("error", (err) => {
  logger.error("Worker error", err);
});

logger.info("Worker started", { queue: RENDER_QUEUE_NAME });

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
  await worker.close();
  await shotWorker.close();
  await connection.quit();
  await shotConnection.quit();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
