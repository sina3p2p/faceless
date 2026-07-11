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

/** Generate a fresh master seed in the [0, 2^31) range. */
export function generateSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}