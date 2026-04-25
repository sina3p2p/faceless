/**
 * Infer which BullMQ job to re-queue from `video_projects.status` after a pipeline failure
 * (`render_jobs.status` = FAILED). Used when `failed_job_name` is not stored.
 */

import type { ResumeJobContext } from "@/types/pipeline-resume";

export type { ResumeJobContext } from "@/types/pipeline-resume";

const UNAMBIGUOUS_STATUS_TO_JOB: Record<string, string> = {
  PENDING: "executive-produce",
  PRODUCING: "executive-produce",
  RESEARCH: "web-research",
  STORY: "generate-story",
  SCENE_SPLIT: "split-scenes",
  SCRIPT_SUPERVISION: "supervise-script",
  TTS_GENERATION: "generate-tts",
  CINEMATOGRAPHY: "cinematography",
  STORYBOARD: "storyboard",
  PROMPT_GENERATION: "generate-prompts",
  MOTION_GENERATION: "generate-pipeline-motion",
};

export function inferResumeJobFromVideoStatus(status: string, ctx: ResumeJobContext): string | null {
  const direct = UNAMBIGUOUS_STATUS_TO_JOB[status];
  if (direct) return direct;

  if (status === "IMAGE_GENERATION") {
    return ctx.hasSceneFrames ? "generate-frame-images" : null;
  }
  if (status === "VIDEO_GENERATION") {
    return ctx.hasSceneFrames ? "generate-frame-videos" : null;
  }
  if (status === "RENDERING") {
    return "compose-final";
  }

  return null;
}
