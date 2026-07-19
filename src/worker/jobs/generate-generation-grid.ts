import { generateGenerationGridImages } from "@/server/services/showrunner/tools/generate-generation-grid";
import { patchMessageToolCall, setJobStatus } from "../job-helpers";
import type { JobRunContext, PayloadBase, WorkerJob } from "./types";

type GridPayload = {
  imagePrompt: string;
  referenceImageUrls: string[];
  aspectRatio: "16:9" | "9:16" | "1:1";
};

export const generateGenerationGridJob: WorkerJob = {
  async run({ jobId, toolCallId, assistantMessageRowId, payload }: JobRunContext) {
    const p = payload as PayloadBase & GridPayload;
    const images = await generateGenerationGridImages(
      p.imagePrompt,
      p.referenceImageUrls ?? [],
    );
    const result = { images };

    await setJobStatus(jobId, "succeeded", result);
    await patchMessageToolCall(assistantMessageRowId, toolCallId, {
      generatedImages: result.images,
      pending: false,
    });
  },

  failPatch: (errorMsg) => ({ gridError: errorMsg, pending: false }),
};
