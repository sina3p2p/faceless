/**
 * Pipeline topology engine.
 *
 * Each video type + model family owns an ordered list of steps in ./pipelines.ts.
 * This file is the type-agnostic engine over those lists — the runner asks
 * `nextStep()` what to do after a stage completes; the approve endpoints ask
 * `stepAfterGate()` what to enqueue when a human clears a review.
 *
 * Topology decides WHERE to go; pipelines.ts decides the route per (type, model).
 * Stage implementations live in individual worker files registered in registry.ts.
 */

import type { PipelineConfig } from "@/types/pipeline";
import { PIPELINES } from "./pipelines";

export type StageName =
  // type-agnostic stages
  | "executive-produce"
  | "web-research"
  | "cinematography"
  | "extract-hero-assets"
  | "storyboard"
  | "generate-prompts"
  | "generate-frame-images"
  | "generate-pipeline-motion"
  | "generate-frame-videos"
  | "generate-frame-videos:audio-lipsync"
  | "compose-final"
  | "compose-final:seedance-2"
  | "supervise-script"
  | "cast-character-voices"
  | "timelapse-plan"
  // type-specific variants — name carries the full identity
  | "generate-story:voiceover"
  | "generate-story:lyrics"
  | "generate-story:screenplay"
  | "split-scenes:director"
  | "split-scenes:screenplay"
  | "generate-tts:voiceover"
  | "generate-tts:song"
  | "generate-tts:movie-dialogue";

/** Review statuses that act as pipeline pause points (manual mode). */
export type ReviewGateStatus =
  | "REVIEW_STORY"
  | "REVIEW_HERO_ASSETS"
  | "REVIEW_PRE_PRODUCTION"
  | "REVIEW_IMAGES"
  | "REVIEW_MOTION"
  | "REVIEW_PRODUCTION";

export type VideoType = "standalone" | "music_video" | "movie" | "timelapse";

/**
 * Groups model IDs into families. Pipelines are defined per (VideoType, ModelFamily).
 * Add new families here as model-specific pipelines diverge.
 */
export type ModelFamily = "default" | "seedance-2";

const SEEDANCE_2_IDS = new Set(["seedance-2-pro", "seedance-2-fast"]);

const VIDEO_TYPES: ReadonlySet<string> = new Set([
  "standalone",
  "music_video",
  "movie",
  "timelapse",
]);

export function resolveVideoType(raw: string | null | undefined): VideoType {
  return raw && VIDEO_TYPES.has(raw) ? (raw as VideoType) : "standalone";
}

export function resolveModelFamily(modelId: string): ModelFamily {
  if (SEEDANCE_2_IDS.has(modelId)) return "seedance-2";
  return "default";
}

export interface PipelineCtx {
  videoType: VideoType;
  modelFamily: ModelFamily;
  config: PipelineConfig;
}

export interface PipelineStep {
  name: StageName;
  gate?: ReviewGateStatus;
  when?: (ctx: PipelineCtx) => boolean;
}

export type NextStep =
  | { kind: "enqueue"; job: StageName }
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

function lookupPipeline(ctx: PipelineCtx): readonly PipelineStep[] {
  const exact = PIPELINES[`${ctx.videoType}:${ctx.modelFamily}`];
  if (exact) return exact;
  const typeDefault = PIPELINES[`${ctx.videoType}:default`];
  if (typeDefault) return typeDefault;
  return PIPELINES["standalone:default"];
}

export function resolveSteps(ctx: PipelineCtx): PipelineStep[] {
  return lookupPipeline(ctx).filter((s) => !s.when || s.when(ctx));
}

export function firstJob(ctx: PipelineCtx): StageName {
  return resolveSteps(ctx)[0].name;
}

export function nextStep(ctx: PipelineCtx, currentStage: StageName): NextStep {
  const steps = resolveSteps(ctx);
  const idx = steps.findIndex((s) => s.name === currentStage);
  if (idx === -1) return { kind: "done" };

  const current = steps[idx];
  const next = steps[idx + 1];
  if (!next) return { kind: "done" };

  if (current.gate && getPipelineMode(ctx.config) === "manual") {
    return { kind: "review", status: current.gate };
  }
  return { kind: "enqueue", job: next.name };
}

export function stepAfterGate(
  ctx: PipelineCtx,
  reviewStatus: ReviewGateStatus
): StageName | null {
  const steps = resolveSteps(ctx);
  const idx = steps.findIndex((s) => s.gate === reviewStatus);
  if (idx === -1) return null;
  return steps[idx + 1]?.name ?? null;
}

const ALL_STAGE_NAMES: ReadonlySet<string> = new Set(
  Object.values(PIPELINES).flatMap((steps) => steps.map((s) => s.name))
);

export function isPipelineStage(name: string): name is StageName {
  return ALL_STAGE_NAMES.has(name);
}
