import { renderAndUploadShot } from "@/server/services/showrunner/tools/compile-shot";
import {
  generateAssetImages,
  generateContinuityPackImages,
  generateGenerationGridImages,
} from "@/server/services/showrunner";
import { JOB_NAMES, type WorkerJobName } from "@/lib/worker-queue";
import { logger } from "@/lib/logger";
import { patchMessageToolCall, setJobStatus } from "./job-helpers";

type PayloadBase = {
  toolCallId: string;
  assistantMessageRowId: string;
};

export async function dispatchWorkerJob(
  jobId: string,
  jobName: string,
  sessionId: string,
  payload: Record<string, unknown>,
) {
  const { toolCallId, assistantMessageRowId } = payload as PayloadBase;

  logger.info("Worker job started", { jobId, jobName, sessionId, toolCallId });
  await setJobStatus(jobId, "in_progress");

  try {
    switch (jobName as WorkerJobName) {
      case JOB_NAMES.GENERATE_SHOT: {
        const result = await runGenerateShot(sessionId, payload as PayloadBase & ShotPayload);
        await setJobStatus(jobId, "succeeded", result);
        await patchMessageToolCall(assistantMessageRowId, toolCallId, {
          videoUrl: result.videoUrl,
          renderedDurationSeconds: result.durationSeconds,
          pending: false,
        });
        break;
      }
      case JOB_NAMES.GENERATE_ASSET_IMAGES: {
        const result = await runGenerateAssetImages(payload as PayloadBase & AssetPayload);
        await setJobStatus(jobId, "succeeded", result);
        await patchMessageToolCall(assistantMessageRowId, toolCallId, {
          generatedImages: result.images,
          pending: false,
        });
        break;
      }
      case JOB_NAMES.GENERATE_CONTINUITY_PACK: {
        const result = await runGenerateContinuityPack(payload as PayloadBase & ContinuityPayload);
        await setJobStatus(jobId, "succeeded", result);
        await patchMessageToolCall(assistantMessageRowId, toolCallId, {
          generatedImages: result.images,
          pending: false,
        });
        break;
      }
      case JOB_NAMES.GENERATE_GENERATION_GRID: {
        const result = await runGenerateGenerationGrid(payload as PayloadBase & GridPayload);
        await setJobStatus(jobId, "succeeded", result);
        await patchMessageToolCall(assistantMessageRowId, toolCallId, {
          generatedImages: result.images,
          pending: false,
        });
        break;
      }
      default:
        throw new Error(`Unknown job name: ${jobName}`);
    }

    logger.info("Worker job completed", { jobId, jobName, sessionId, toolCallId });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("Worker job failed", err as Error, { jobId, jobName, sessionId, toolCallId });

    await setJobStatus(jobId, "failed", { error: errorMsg });

    const failPatch =
      jobName === JOB_NAMES.GENERATE_SHOT
        ? { shotError: errorMsg, pending: false }
        : jobName === JOB_NAMES.GENERATE_CONTINUITY_PACK
          ? { packError: errorMsg, pending: false }
          : jobName === JOB_NAMES.GENERATE_GENERATION_GRID
            ? { gridError: errorMsg, pending: false }
            : { pending: false, error: errorMsg };

    await patchMessageToolCall(assistantMessageRowId, toolCallId, failPatch);
    throw err;
  }
}

type ShotPayload = {
  referenceImageUrls: string[];
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number;
  continuityMode?: "fresh" | "extend_video";
  sourceVideoUrl?: string;
};

async function runGenerateShot(sessionId: string, payload: PayloadBase & ShotPayload) {
  const key = `v2/shots/${sessionId}/${payload.toolCallId}.mp4`;
  const { url: videoUrl, durationSeconds, mediaId } = await renderAndUploadShot(
    {
      prompt: payload.prompt,
      referenceImageUrls: payload.referenceImageUrls ?? [],
      aspectRatio: payload.aspectRatio,
      duration: payload.duration,
      continuityMode: payload.continuityMode,
      sourceVideoUrl: payload.sourceVideoUrl,
    },
    sessionId,
    key,
  );
  return { videoUrl, durationSeconds, mediaId };
}

type AssetPayload = {
  imagePrompt: string;
  assetKind: "character" | "location" | "object";
  userId: string;
};

async function runGenerateAssetImages(payload: PayloadBase & AssetPayload) {
  const images = await generateAssetImages(
    payload.imagePrompt,
    payload.assetKind,
    payload.userId,
  );
  return { images };
}

type ContinuityPayload = {
  keyframes: { imagePrompt: string }[];
  referenceImageUrls: string[];
  aspectRatio: "16:9" | "9:16" | "1:1";
};

async function runGenerateContinuityPack(payload: PayloadBase & ContinuityPayload) {
  const images = await generateContinuityPackImages(
    payload.keyframes,
    payload.referenceImageUrls ?? [],
    payload.aspectRatio ?? "16:9",
  );
  return { images };
}

type GridPayload = {
  imagePrompt: string;
  referenceImageUrls: string[];
  aspectRatio: "16:9" | "9:16" | "1:1";
};

async function runGenerateGenerationGrid(payload: PayloadBase & GridPayload) {
  const images = await generateGenerationGridImages(
    payload.imagePrompt,
    payload.referenceImageUrls ?? [],
    payload.aspectRatio ?? "16:9",
  );
  return { images };
}
