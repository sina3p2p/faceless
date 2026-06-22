import { Queue } from "bullmq";
import { redis } from "./redis";

export const SHOT_QUEUE_NAME = "shot-generation";

export interface ShotJobData {
  sessionId: string;
  toolCallId: string;
  assistantMessageRowId: string;
  referenceImageUrls: string[];
  prompt: string;
  aspectRatio: "16:9" | "9:16" | "1:1";
  duration: number;
}

export const shotQueue = new Queue(SHOT_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});
