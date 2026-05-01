/**
 * Master-seed utilities. A single seed lives on the video project; per-stage
 * subseeds are derived deterministically so a re-roll of the same stage
 * (e.g. the image-generation stage) reproduces its outputs without rolling
 * the rest of the pipeline.
 *
 * Subseeds are non-negative 32-bit integers — the widest range every model
 * provider we use accepts.
 */

const MAX_SEED = 0x7fffffff;

export type PipelineStage =
  | "story"
  | "image"
  | "motion"
  | "music"
  | "tts";

/** Generate a fresh master seed in the [0, 2^31) range. */
export function generateSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

/** FNV-1a 32-bit string hash. Tiny, fast, no deps. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Derive a deterministic subseed from a master seed and a stage label. Same
 * inputs always produce the same subseed; different stages produce different
 * subseeds so an image re-roll doesn't re-randomize music or motion.
 */
export function deriveSubseed(masterSeed: number, stage: PipelineStage): number {
  const mixed = fnv1a(`${masterSeed}:${stage}`);
  return mixed & MAX_SEED;
}
