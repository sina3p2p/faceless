import { renderAndUploadShot } from "@/server/services/showrunner/tools/compile-shot";
import {
  generateAssetGallery,
  generateAssetImages,
} from "@/server/services/showrunner/tools/generate-asset-references";
import { generateGenerationGridImages } from "@/server/services/showrunner/tools/generate-generation-grid";
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
          ...(result.filmstripUrl
            ? { filmstripUrl: result.filmstripUrl, filmstripTiles: result.filmstripTiles }
            : {}),
          pending: false,
        });
        break;
      }
      case JOB_NAMES.GENERATE_ASSET_IMAGES: {
        const result = await runGenerateAssetImages(payload as PayloadBase & AssetPayload);
        await setJobStatus(jobId, "succeeded", result);
        await patchMessageToolCall(assistantMessageRowId, toolCallId, {
          ...result.patch,
          pending: false,
          error: undefined,
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
  const { url: videoUrl, durationSeconds, mediaId, filmstripUrl, filmstripTiles } = await renderAndUploadShot(
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
  return { videoUrl, durationSeconds, mediaId, filmstripUrl, filmstripTiles };
}

type AssetPayload = {
  userId: string;
  assets?: Array<{
    assetHandle: string;
    assetKind: "character" | "location" | "object";
    imagePrompt: string;
  }>;
  assetHandle?: string;
  assetKind?: "character" | "location" | "object";
  imagePrompt?: string;
  existingGeneratedAssets?: Array<{
    assetHandle: string;
    assetKind: "character" | "location" | "object";
    candidates: Array<{ id: string; url: string }>;
  }>;
};

async function runGenerateAssetImages(payload: PayloadBase & AssetPayload) {
  if (payload.assets?.length) {
    const generatedAssets = await generateAssetGallery(payload.assets, payload.userId);
    return {
      images: generatedAssets.flatMap((a) => a.candidates.map((c) => c.id)),
      generatedAssets,
      patch: { generatedAssets, generatedImages: undefined },
    };
  }

  const handle = payload.assetHandle!;
  const kind = payload.assetKind!;
  const prompt = payload.imagePrompt!;
  const candidates = await generateAssetImages(prompt, kind, payload.userId);
  const existing = payload.existingGeneratedAssets ?? [];
  const generatedAssets = existing.some((a) => a.assetHandle === handle)
    ? existing.map((a) =>
        a.assetHandle === handle ? { assetHandle: handle, assetKind: kind, candidates } : a
      )
    : [...existing, { assetHandle: handle, assetKind: kind, candidates }];

  return {
    images: candidates.map((c) => c.id),
    generatedAssets,
    patch: { generatedAssets },
  };
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
