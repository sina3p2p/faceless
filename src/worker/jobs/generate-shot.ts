import { renderAndUploadShot } from "@/server/services/showrunner/tools/compile-shot";
import { patchMessageToolCall, setJobStatus } from "../job-helpers";
import type { JobRunContext, PayloadBase, WorkerJob } from "./types";

type ShotPayload = {
  referenceImageUrls: string[];
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number;
  continuityMode?: "fresh" | "extend_video";
  sourceVideoUrl?: string;
};

export const generateShotJob: WorkerJob = {
  async run({ jobId, sessionId, toolCallId, assistantMessageRowId, payload }: JobRunContext) {
    const p = payload as PayloadBase & ShotPayload;
    const key = `v2/shots/${sessionId}/${toolCallId}.mp4`;
    const { url: videoUrl, durationSeconds, mediaId, filmstripUrl, filmstripTiles } =
      await renderAndUploadShot(
        {
          prompt: p.prompt,
          referenceImageUrls: p.referenceImageUrls ?? [],
          aspectRatio: p.aspectRatio,
          duration: p.duration,
          continuityMode: p.continuityMode,
          sourceVideoUrl: p.sourceVideoUrl,
        },
        sessionId,
        key,
      );

    const result = { videoUrl, durationSeconds, mediaId, filmstripUrl, filmstripTiles };
    await setJobStatus(jobId, "succeeded", result);
    await patchMessageToolCall(assistantMessageRowId, toolCallId, {
      videoUrl: result.videoUrl,
      renderedDurationSeconds: result.durationSeconds,
      ...(result.filmstripUrl
        ? { filmstripUrl: result.filmstripUrl, filmstripTiles: result.filmstripTiles }
        : {}),
      pending: false,
    });
  },

  failPatch: (errorMsg) => ({ shotError: errorMsg, pending: false }),
};
