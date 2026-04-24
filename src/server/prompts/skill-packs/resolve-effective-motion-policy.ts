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
 */
export function resolveEffectiveMotionPolicy(
  basePolicy: MotionPolicy,
  opts: { narrativeIntent?: NarrativeIntent; musicSectionId?: MusicSectionId }
): MotionPolicy {
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
