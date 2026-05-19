/**
 * Per-strategy pipeline definitions.
 *
 * Each video type owns its pipeline shape here, alongside its behavioral
 * strategy. Add or reorder steps, change gates, or fork a type's flow by
 * editing only that type's array — types no longer have to share one graph.
 *
 * This module is intentionally PURE (it imports only types from
 * ../topology). The topology engine and the Next API routes that resume
 * review gates depend on it, so it must never pull in db / services / bullmq.
 * Behavioral code lives in the sibling strategy classes, not here.
 */

import type { PipelineStep, PipelineCtx, VideoType } from "../topology";

export const standalonePipeline: readonly PipelineStep[] = [
  { name: "executive-produce" },
  { name: "web-research", when: (c: PipelineCtx) => c.config.webResearch === true },
  { name: "generate-story" },
  { name: "split-scenes" },
  { name: "supervise-script", gate: "REVIEW_STORY" },
  { name: "generate-tts" },
  { name: "cinematography" },
  // Soft gate: auto mode chains through, manual mode pauses — same as every
  // other review step.
  { name: "extract-hero-assets", gate: "REVIEW_HERO_ASSETS" },
  { name: "storyboard", gate: "REVIEW_PRE_PRODUCTION" },
  { name: "generate-prompts" },
  { name: "generate-frame-images", gate: "REVIEW_IMAGES" },
  { name: "generate-pipeline-motion", gate: "REVIEW_MOTION" },
  { name: "generate-frame-videos", gate: "REVIEW_PRODUCTION" },
  { name: "compose-final" },
];

// music_video and movie currently share standalone's shape; their divergence
// is behavioral (see the sibling strategy classes). Give them their own
// bindings so either can fork its flow without touching the others.
export const musicPipeline: readonly PipelineStep[] = standalonePipeline;
export const moviePipeline: readonly PipelineStep[] = standalonePipeline;

// Timelapse replaces the brief → story → director → storyboard → motion chain
// with a single slim planner, then rejoins the shared audio/image/video/
// compose tail. It never runs executive-produce (no creative brief) or motion
// (the planner already emits motionSpecs) — the divergence is expressed here
// in the pipeline, not via a behavioral flag.
export const timelapsePipeline: readonly PipelineStep[] = [
  { name: "timelapse-plan" },
  { name: "generate-tts" },
  { name: "generate-frame-images", gate: "REVIEW_IMAGES" },
  { name: "generate-frame-videos", gate: "REVIEW_PRODUCTION" },
  { name: "compose-final" },
];

export const STRATEGY_PIPELINES: Record<VideoType, readonly PipelineStep[]> = {
  standalone: standalonePipeline,
  music_video: musicPipeline,
  movie: moviePipeline,
  timelapse: timelapsePipeline,
};
