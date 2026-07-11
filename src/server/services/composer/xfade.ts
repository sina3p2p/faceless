export type TransitionType = "cut" | "dissolve" | "fade" | "match-cut" | "whip-pan";


/**
 * xfade chain builder for frame-to-frame transitions within a single scene.
 *
 * The first frame has no incoming transition (it's the scene's opening),
 * so transitions[0] is conceptually ignored — only transitions[1..N-1] decide
 * how each subsequent frame blends into the prior one.
 *
 * The compiled clip is shorter than Σ frameDurations by Σ transitionDurations,
 * since each xfade overlaps a transitionDuration window across two clips.
 * Callers should use `effectiveTotalDuration` for downstream timing math.
 */

export interface TransitionTiming {
  /** ffmpeg xfade transition name. */
  name: string;
  /** Overlap window in seconds. */
  durationS: number;
}

const TRANSITION_TIMING: Record<Exclude<TransitionType, "cut">, TransitionTiming> = {
  dissolve: { name: "fade", durationS: 0.4 },
  fade: { name: "fadeblack", durationS: 0.5 },
  // No real visual match — short fade is the cleanest approximation without
  // analysing pixels. Composer-level match-cut is best-effort polish.
  "match-cut": { name: "fade", durationS: 0.15 },
  "whip-pan": { name: "slideleft", durationS: 0.25 },
};

export type ChainTransition = TransitionType | null;

export interface XfadeChainResult {
  /** Filter graph string ready to drop into `-filter_complex`. */
  filter: string;
  /** Effective output duration (Σ frameDurations − Σ transition overlaps). */
  effectiveTotalDuration: number;
  /** Final video stream label inside the graph (for `-map`). */
  outLabel: string;
}

/** True if the scene needs the re-encoding xfade path; false means concat-copy is safe. */
export function sceneNeedsXfade(transitions: ChainTransition[]): boolean {
  // transitions[0] is ignored (no incoming for first frame). If every other
  // frame's transition is null/undefined or "cut" we can stay on the cheap path.
  for (let i = 1; i < transitions.length; i++) {
    const t = transitions[i];
    if (t && t !== "cut") return true;
  }
  return false;
}

/**
 * Build the xfade filter graph for a list of frame clips.
 *
 * Each consecutive pair (Pi, Pi+1) is xfaded with the transition declared by
 * transitions[i+1], using offset = Σ priorEffectiveDurations - transitionDuration.
 * "cut" or null transitions concatenate without overlap (offset = sum, dur = 0).
 */
export function buildXfadeFilterChain(
  frameDurations: number[],
  transitions: ChainTransition[]
): XfadeChainResult {
  if (frameDurations.length === 0) {
    return { filter: "", effectiveTotalDuration: 0, outLabel: "[v0]" };
  }
  if (frameDurations.length !== transitions.length) {
    throw new Error(
      `xfade chain mismatch: ${frameDurations.length} clips vs ${transitions.length} transitions`
    );
  }
  if (frameDurations.length === 1) {
    // Single clip — caller should use it directly, but return a safe value.
    return { filter: "", effectiveTotalDuration: frameDurations[0], outLabel: "[0:v]" };
  }

  const segments: string[] = [];
  let cumulative = frameDurations[0];
  let prevLabel = "[0:v]";

  for (let i = 1; i < frameDurations.length; i++) {
    const transition = transitions[i] ?? "cut";
    const timing =
      transition === "cut" ? { name: "fade", durationS: 0 } : TRANSITION_TIMING[transition];
    const offset = Math.max(0, cumulative - timing.durationS);
    const outLabel = `[v${i}]`;

    if (timing.durationS === 0) {
      // Hard cut path inside an xfade-mode scene: emulate concat with a
      // zero-duration xfade so labels stay consistent.
      segments.push(
        `${prevLabel}[${i}:v]xfade=transition=fade:duration=0:offset=${offset.toFixed(3)}${outLabel}`
      );
    } else {
      segments.push(
        `${prevLabel}[${i}:v]xfade=transition=${timing.name}:duration=${timing.durationS.toFixed(3)}:offset=${offset.toFixed(3)}${outLabel}`
      );
    }

    cumulative = cumulative - timing.durationS + frameDurations[i];
    prevLabel = outLabel;
  }

  return {
    filter: segments.join(";"),
    effectiveTotalDuration: cumulative,
    outLabel: prevLabel,
  };
}

export const __TEST_ONLY = { TRANSITION_TIMING };
