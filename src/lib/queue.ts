import { Queue } from "bullmq";
import { redis } from "./redis";
import { RENDER_QUEUE_NAME } from "./constants";

export const renderQueue = new Queue(RENDER_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export interface RenderJobData {
  videoProjectId: string;
  seriesId: string;
  userId: string;
  rerender?: boolean;
}

export async function enqueueRenderJob(
  data: RenderJobData
): Promise<string> {
  const jobId = `render-${data.videoProjectId}-${Date.now()}`;
  const job = await renderQueue.add("render-video", data, { jobId });
  return job.id ?? data.videoProjectId;
}
