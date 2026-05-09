import type { MotionPolicy, NarrativeIntent } from "@/types/pipeline";
import type { MusicSectionId } from "@/types/motion-skill-hints";

const INTENT_LADDER: Record<NarrativeIntent, MotionPolicy> = {
  introduce: "subtle",
  build: "moderate",
  climax: "dynamic",
  react: "moderate",
  transition: "subtle",
  resolve: "subtle",
};

const MUSIC_LADDER: Record<MusicSectionId, MotionPolicy> = {
  none: "moderate",
  intro: "subtle",
  verse: "moderate",
  pre_chorus: "moderate",
  build: "dynamic",
  chorus: "dynamic",
  bridge: "moderate",
  breakdown: "frenetic",
  drop: "frenetic",
  outro: "subtle",
};

/**
 * Refines `basePolicy` using music section (highest priority when set) or narrative intent.
 * Falls back to `basePolicy` if refinements are absent.
 *
 * `timelapse` takes top priority and clamps the camera to "subtle": in timelapse mode the
 * apparent motion comes from compressed-time subject motion (sun, clouds, crowds), not
 * from camera moves, so music/intent ladders must not override the locked camera.
 */
export function resolveEffectiveMotionPolicy(
  basePolicy: MotionPolicy,
  opts: { narrativeIntent?: NarrativeIntent; musicSectionId?: MusicSectionId; timelapse?: boolean }
): MotionPolicy {
  if (opts.timelapse) return "subtle";
  const m = opts.musicSectionId;
  if (m && m !== "none" && m in MUSIC_LADDER) {
    return MUSIC_LADDER[m];
  }
  const n = opts.narrativeIntent;
  if (n) {
    return INTENT_LADDER[n] ?? basePolicy;
  }
  return basePolicy;
}

/**
 * Suggests a default camera-move grammar keyed off the storyboard's narrative
 * intent (with a music-section override when available). Returned as a short
 * phrase the Motion Director system prompt can soft-bias toward; the LLM may
 * still choose otherwise when `cameraPhysics` constraints conflict.
 */
const CAMERA_GRAMMAR_BY_INTENT: Record<NarrativeIntent, string> = {
  introduce: "push-in slow OR handheld drift forward — invite the viewer in",
  build: "lock-off or slow lateral track — let subject motion carry tension",
  climax: "dolly-in, orbit, or wide arc — camera as active participant",
  react: "push to close-up or rack focus to the reacting subject",
  resolve: "pull-out or slow tilt-up — release the held energy",
  transition: "whip or match motion that hands the eye to the next frame",
};

const CAMERA_GRAMMAR_BY_MUSIC_SECTION: Partial<Record<MusicSectionId, string>> = {
  intro: "push-in slow OR locked drift — settle the viewer",
  build: "rising track — accelerate camera energy with the music",
  drop: "snap-zoom, whip, or aggressive dolly — match the impact",
  chorus: "dolly-in, orbit, or arc — keep the energy continuous",
  outro: "pull-out or slow tilt — release",
};

export function resolveCameraGrammar(opts: {
  narrativeIntent?: NarrativeIntent;
  musicSectionId?: MusicSectionId;
}): string | null {
  const m = opts.musicSectionId;
  if (m && CAMERA_GRAMMAR_BY_MUSIC_SECTION[m]) {
    return CAMERA_GRAMMAR_BY_MUSIC_SECTION[m]!;
  }
  const n = opts.narrativeIntent;
  if (n) return CAMERA_GRAMMAR_BY_INTENT[n] ?? null;
  return null;
}
