/**
 * Pipeline topology engine.
 *
 * Before this module the flow was implicit: every worker hardcoded the next
 * job in its tail (`renderQueue.add(...)`, `autoChainOrReview(...)`), and the
 * six `approve-*` endpoints hardcoded the job to resume after their review
 * gate. The graph was smeared across ~20 files and no single place answered
 * "what does the movie pipeline look like".
 *
 * Now: each video type owns an ordered list of steps in
 * ./strategies/pipelines.ts (a step may carry a review `gate` that pauses the
 * pipeline in manual mode, and/or a `when` predicate that skips it). This file
 * is the type-agnostic engine over those lists — the runner asks `nextStep()`
 * what to do after a stage completes; the approve endpoints ask
 * `stepAfterGate()` what to enqueue when a human clears a review.
 *
 * Topology decides WHERE to go; the per-type pipeline decides the route.
 * Strategies (./strategies) decide WHAT each stage does. Stage shells handle
 * HOW results are persisted.
 */

import type { PipelineConfig } from "@/types/pipeline";
import { STRATEGY_PIPELINES } from "./strategies/pipelines";

export type JobName =
  | "executive-produce"
  | "web-research"
  | "generate-story"
  | "split-scenes"
  | "supervise-script"
  | "generate-tts"
  | "cinematography"
  | "extract-hero-assets"
  | "storyboard"
  | "generate-prompts"
  | "generate-frame-images"
  | "generate-pipeline-motion"
  | "generate-frame-videos"
  | "compose-final"
  | "timelapse-plan";

/** Review statuses that act as pipeline pause points (manual mode). */
export type ReviewGateStatus =
  | "REVIEW_STORY"
  | "REVIEW_HERO_ASSETS"
  | "REVIEW_PRE_PRODUCTION"
  | "REVIEW_IMAGES"
  | "REVIEW_MOTION"
  | "REVIEW_PRODUCTION";

export type VideoType = "standalone" | "music_video" | "movie" | "timelapse";

const VIDEO_TYPES: ReadonlySet<string> = new Set([
  "standalone",
  "music_video",
  "movie",
  "timelapse",
]);

/** `video_projects.video_type` is a plain text column; normalize unknowns. */
export function resolveVideoType(raw: string | null | undefined): VideoType {
  return raw && VIDEO_TYPES.has(raw) ? (raw as VideoType) : "standalone";
}

export interface PipelineCtx {
  videoType: VideoType;
  config: PipelineConfig;
}

export interface PipelineStep {
  name: JobName;
  /**
   * If set, the pipeline pauses with this review status after this step
   * completes (manual mode only). In auto mode it chains straight through.
   */
  gate?: ReviewGateStatus;
  /** When present and false for the project, this step is skipped entirely. */
  when?: (ctx: PipelineCtx) => boolean;
}

export type NextStep =
  | { kind: "enqueue"; job: JobName }
  | { kind: "review"; status: ReviewGateStatus }
  | { kind: "done" };

export function getPipelineMode(config: unknown): "manual" | "auto" {
  if (config && typeof config === "object" && "pipelineMode" in config) {
    return (config as Record<string, unknown>).pipelineMode === "auto"
      ? "auto"
      : "manual";
  }
  return "manual";
}

/** Steps for this project's type with `when:false` steps removed. */
export function resolveSteps(ctx: PipelineCtx): PipelineStep[] {
  return STRATEGY_PIPELINES[ctx.videoType].filter((s) => !s.when || s.when(ctx));
}

/** First job to enqueue when a project's pipeline starts. */
export function firstJob(ctx: PipelineCtx): JobName {
  const steps = resolveSteps(ctx);
  return steps[0].name;
}

/**
 * What the runner should do after `currentJob` finishes. The gate on the
 * *completed* step decides whether we pause: e.g. supervise-script carries
 * `gate: REVIEW_STORY`, so finishing it pauses (manual) before generate-tts.
 */
export function nextStep(ctx: PipelineCtx, currentJob: JobName): NextStep {
  const steps = resolveSteps(ctx);
  const idx = steps.findIndex((s) => s.name === currentJob);
  if (idx === -1) return { kind: "done" };

  const current = steps[idx];
  const next = steps[idx + 1];
  if (!next) return { kind: "done" };

  if (current.gate && getPipelineMode(ctx.config) === "manual") {
    return { kind: "review", status: current.gate };
  }
  return { kind: "enqueue", job: next.name };
}

/**
 * The job to enqueue when a human clears `reviewStatus`. Resolves against the
 * project's own (possibly conditional) step list so e.g. clearing
 * REVIEW_IMAGES on a timelapse correctly skips motion.
 */
export function stepAfterGate(
  ctx: PipelineCtx,
  reviewStatus: ReviewGateStatus
): JobName | null {
  const steps = resolveSteps(ctx);
  const idx = steps.findIndex((s) => s.gate === reviewStatus);
  if (idx === -1) return null;
  return steps[idx + 1]?.name ?? null;
}

/** Whether a string is a pipeline job (in any type's pipeline) the runner should advance from. */
export function isPipelineJob(name: string): name is JobName {
  return Object.values(STRATEGY_PIPELINES).some((steps) =>
    steps.some((s) => s.name === name)
  );
}
