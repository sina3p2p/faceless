/**
 * Pipeline failure: `render_jobs.status` = FAILED + `error` (not cancel message).
 * `video_projects.status` stays on the current phase. Resume job is inferred from status
 * (see `infer-resume-job.ts`).
 */

import { inferResumeJobFromVideoStatus, type ResumeJobContext } from "./infer-resume-job";
import type { RenderJobSnapshot } from "@/types/pipeline-resume";

export { inferResumeJobFromVideoStatus, type ResumeJobContext };
export type { RenderJobSnapshot } from "@/types/pipeline-resume";

export const PIPELINE_JOB_LABELS: Record<string, string> = {
  "executive-produce": "Creative brief",
  "generate-story": "Story writing",
  "split-scenes": "Scene breakdown",
  "supervise-script": "Continuity check",
  "generate-tts": "Audio narration",
  "cinematography": "Visual style",
  "storyboard": "Frame planning",
  "generate-prompts": "Image prompts",
  "generate-frame-images": "Image generation",
  "generate-pipeline-motion": "Motion design",
  "generate-frame-videos": "Video clips",
  "compose-final": "Final composition",
};

const RESUMABLE_JOBS = new Set([
  "executive-produce",
  "generate-story",
  "split-scenes",
  "supervise-script",
  "generate-tts",
  "cinematography",
  "storyboard",
  "generate-prompts",
  "generate-frame-images",
  "generate-pipeline-motion",
  "generate-frame-videos",
  "compose-final",
]);


/** Must match `cancel` route render_jobs error text. */
export const RENDER_JOB_CANCELLED_MESSAGE = "Cancelled by user";

export function hasPipelineRenderFailure(rj: RenderJobSnapshot | undefined | null): boolean {
  if (rj?.status !== "FAILED" || !rj.error) return false;
  return rj.error !== RENDER_JOB_CANCELLED_MESSAGE;
}

export function isResumablePipelineJob(jobName: string | null | undefined): jobName is string {
  return !!jobName && RESUMABLE_JOBS.has(jobName);
}

export function pipelineJobDisplayName(jobName: string | null | undefined): string {
  if (!jobName) return "Pipeline";
  return PIPELINE_JOB_LABELS[jobName] ?? jobName;
}
/** Whether resume is plausible for this video + render row (client; server re-validates with DB). */
export function canShowResumeForVideo(video: {
  status: string;
  renderJobs?: Array<RenderJobSnapshot & { step?: string }>;
}): boolean {
  if (video.status === "CANCELLED") return false;
  if (!hasPipelineRenderFailure(video.renderJobs?.[0])) return false;
  const rj = video.renderJobs?.[0];
  const baseCtx = { hasSceneFrames: true, renderJobStep: rj?.step };
  const job = inferResumeJobFromVideoStatus(video.status, baseCtx);
  if (job && isResumablePipelineJob(job)) return true;
  const jobLo = inferResumeJobFromVideoStatus(video.status, { hasSceneFrames: false, renderJobStep: rj?.step });
  return isResumablePipelineJob(jobLo);
}

/** Full reset / resume-from-scratch allowed when pipeline failed or legacy FAILED. */
export function canRetryOrResumeFromFailure(video: {
  status: string;
  renderJobs?: RenderJobSnapshot[];
}): boolean {
  return hasPipelineRenderFailure(video.renderJobs?.[0]);
}

/** List / polling: not in an active generating state. */
export function isVideoListNonActive(video: { status: string; renderJobs?: RenderJobSnapshot[] }): boolean {
  if (video.status === "COMPLETED" || video.status === "CANCELLED") {
    return true;
  }
  return hasPipelineRenderFailure(video.renderJobs?.[0]);
}
