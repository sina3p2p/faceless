import { generateGenerationGridImages } from "@/server/services/showrunner/tools/generate-generation-grid";
import { gridHandleFromIds } from "@/server/services/showrunner/handle-resolver";
import { patchMessageToolCall, setJobStatus } from "../job-helpers";
import type { JobRunContext, PayloadBase, WorkerJob } from "./types";

type GridPayload = {
  imagePrompt: string;
  referenceImageUrls: string[];
  aspectRatio: "16:9" | "9:16" | "1:1";
  sceneId?: string | number;
  generationId?: string;
};

export const generateGenerationGridJob: WorkerJob = {
  async run({ jobId, sessionId, toolCallId, assistantMessageRowId, payload }: JobRunContext) {
    const p = payload as PayloadBase & GridPayload;
    const handle =
      p.sceneId != null && p.generationId
        ? gridHandleFromIds(p.sceneId, p.generationId)
        : `grid_${toolCallId}`;
    const images = await generateGenerationGridImages(
      p.imagePrompt,
      p.referenceImageUrls ?? [],
      sessionId,
      handle,
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
