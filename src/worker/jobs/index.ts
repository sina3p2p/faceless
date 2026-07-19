import { JOB_NAMES, type WorkerJobName } from "@/lib/worker-queue";
import { generateAssetImagesJob } from "./generate-asset-images";
import { generateGenerationGridJob } from "./generate-generation-grid";
import { generateShotJob } from "./generate-shot";
import type { WorkerJob } from "./types";

export type { PayloadBase, WorkerJob } from "./types";

export const workerJobs: Record<WorkerJobName, WorkerJob> = {
  [JOB_NAMES.GENERATE_SHOT]: generateShotJob,
  [JOB_NAMES.GENERATE_ASSET_IMAGES]: generateAssetImagesJob,
  [JOB_NAMES.GENERATE_GENERATION_GRID]: generateGenerationGridJob,
};
