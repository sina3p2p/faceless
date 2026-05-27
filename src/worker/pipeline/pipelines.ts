/**
 * Explicit pipeline definitions — one entry per (VideoType, ModelFamily) combination.
 *
 * Each pipeline is a plain ordered array of stage names. The stage name is the
 * full identity of what runs: "generate-story:screenplay" and
 * "generate-story:voiceover" are distinct stages with distinct implementations.
 * No strategy dispatch, no class overrides — read the array to know exactly
 * what a pipeline does.
 *
 * Resolution order in topology.ts: exact (type:model) match → (type:default) →
 * standalone:default. Add a new key here to fork any (type, model) combination
 * without touching existing pipelines.
 *
 * This module is intentionally PURE — no db / services / bullmq imports.
 */

import type { PipelineStep, PipelineCtx } from "./topology";

const webResearch: PipelineStep = {
  name: "web-research",
  when: (c: PipelineCtx) => c.config.webResearch === true,
};

const sharedVisualTail: readonly PipelineStep[] = [
  { name: "cinematography" },
  { name: "extract-hero-assets", gate: "REVIEW_HERO_ASSETS" },
  { name: "storyboard", gate: "REVIEW_PRE_PRODUCTION" },
  { name: "generate-prompts" },
  { name: "generate-frame-images", gate: "REVIEW_IMAGES" },
  { name: "generate-pipeline-motion", gate: "REVIEW_MOTION" },
  { name: "generate-frame-videos", gate: "REVIEW_PRODUCTION" },
  { name: "compose-final" },
];

export const PIPELINES: Record<string, readonly PipelineStep[]> = {
  "standalone:default": [
    { name: "executive-produce" },
    webResearch,
    { name: "generate-story:voiceover" },
    { name: "split-scenes:director" },
    { name: "supervise-script", gate: "REVIEW_STORY" },
    { name: "generate-tts:voiceover" },
    ...sharedVisualTail,
  ],

  "music_video:default": [
    { name: "executive-produce" },
    webResearch,
    { name: "generate-story:lyrics" },
    { name: "split-scenes:director" },
    { name: "supervise-script", gate: "REVIEW_STORY" },
    { name: "generate-tts:song" },
    ...sharedVisualTail,
  ],

  "movie:default": [
    { name: "executive-produce" },
    webResearch,
    { name: "generate-story:screenplay" },
    { name: "split-scenes:screenplay" },
    { name: "supervise-script", gate: "REVIEW_STORY" },
    { name: "cast-character-voices" },
    { name: "generate-tts:movie-dialogue" },
    ...sharedVisualTail,
  ],

  // Seedance 2 movie: native audio-driven lipsync via reference_images + reference_audios.
  // Speaking frames use the reference mode API — no post-generation audio swap needed.
  // Non-speaking frames fall back to standard i2v within the same stage.
  "movie:seedance-2": [
    { name: "executive-produce" },
    webResearch,
    { name: "generate-story:screenplay" },
    { name: "split-scenes:screenplay" },
    { name: "supervise-script", gate: "REVIEW_STORY" },
    { name: "cast-character-voices" },
    { name: "generate-tts:movie-dialogue" },
    ...sharedVisualTail.slice(0, -2), // up to generate-frame-images + motion
    { name: "generate-frame-videos:audio-lipsync", gate: "REVIEW_PRODUCTION" },
    { name: "compose-final" },
  ],

  "timelapse:default": [
    { name: "timelapse-plan" },
    { name: "generate-tts:voiceover" },
    { name: "generate-frame-images", gate: "REVIEW_IMAGES" },
    { name: "generate-frame-videos", gate: "REVIEW_PRODUCTION" },
    { name: "compose-final" },
  ],
};
