import type { HookPatternId, MusicSectionId, VerticalPackId, CameraPhraseId } from "@/types/motion-skill-hints";

/**
 * Short, direct lines merged into the motion system prompt. Selectable in UI by id.
 */
const HOOK_INSTRUCTION: Record<Exclude<HookPatternId, "none">, string> = {
  macro_reveal:
    "Open with an extreme close detail (texture, light catch, or micro-motion), then reveal the full subject or space within the first two seconds. primaryAction and camera must stage that opening beat before the main move.",
  silence_impact:
    "Start near-still: minimal camera drift or locked frame, one barely perceptible element moves, then a single decisive motion or camera lurch for impact. Build contrast between quiet and hit.",
  color_shift:
    "Open with a motivated grade or color temperature shift in the first second (bounce, flag, or practical), then let action land in the new look. name light sources, not abstract mood words.",
  whip_reveal:
    "Fast roll or whip in the first 0.5s that resolves into a stable, readable hold; no double whip. cameraMove should name direction and that it settles; primaryAction is one main beat after the settle.",
  punch_in:
    "Aggressive short push on the first beat—camera or body toward lens—then one clear follow-through. Keep one dominant action; no second unrelated punch.",
  tension_release:
    "Slight off-balance or compressed framing early, then expand or step back as tension drops. one continuous arc, not two story beats.",
  reveal_held:
    "Hold a stable or barely drifting frame, let one object or hand enter from edge; delay the main action until the mid-clip. First two seconds = anticipation only.",
};

const CAMERA_PREFERENCE: Record<Exclude<CameraPhraseId, "none">, string> = {
  push_in_slow: "slow dolly in toward subject, breathing pace, no zoom buzz",
  pull_back_reveal: "steady dolly or truck back to widen context; horizon stays level",
  orbit_slight: "subtle arc or quarter-orbit, low radius, one direction only",
  dolly_lateral: "parallel track, medium speed, eyeline stays consistent with movement",
  whip_pan_settle: "whip in one axis then hard settle; no second pan",
  rack_emphasis: "one rack focus from foreground to key subject, single plane shift",
  locked_tripod: "tripod-locked, imperceptible shake only if policy allows",
  drift_handheld: "loose handheld drift, weight in elbows, not chaotic shake",
  static_foreground: "frame locked; all motion in subject and environment, not the camera",
};

const VERTICAL_TONE: Record<Exclude<VerticalPackId, "default">, string> = {
  cinematic: "Favor long lenses, depth separation, motivated practicals, editorial pacing; avoid influencer jump-cuts in camera grammar.",
  social: "Front-load readable focal action, bold silhouette, 0–2s must read without sound; one clear pay-off beat.",
  music: "Sync one motion accent per phrase when narration allows; use section energy (verse vs chorus) to calibrate size of move.",
  ecom: "Clean read of product; camera supports hero surface and material, no story clutter.",
  brand: "Purposeful, restrained moves; one hero metaphor action; avoid novelty for novelty.",
};

export function hookInjection(id: HookPatternId): string {
  if (id === "none" || !HOOK_INSTRUCTION[id as Exclude<HookPatternId, "none">]) return "";
  return HOOK_INSTRUCTION[id as Exclude<HookPatternId, "none">];
}

export function cameraPhraseInjection(id: CameraPhraseId): string {
  if (id === "none") return "";
  return CAMERA_PREFERENCE[id as Exclude<CameraPhraseId, "none">];
}

export function verticalPackInjection(id: VerticalPackId): string {
  if (id === "default" || !id) return "";
  return VERTICAL_TONE[id as Exclude<VerticalPackId, "default">] ?? "";
}

const MUSIC_ACCENT = {
  intro: "Section: intro—small, measured moves; set tone without peaking early.",
  verse: "Section: verse—narrative stepping-stone, moderate size, grounded camera.",
  pre_chorus: "Section: pre-chorus—begin ramp; one extra degree of energy vs verse.",
  chorus: "Section: chorus—big readable silhouette, one dominant gesture or camera size-up.",
  bridge: "Section: bridge—contrast (space, stillness, or new angle) vs adjacent sections.",
  breakdown: "Section: breakdown—tight, punchy micro-beats; still one primary action per shot.",
  build: "Section: build—crescendo feel; add motion toward the drop, not a full pay-off yet.",
  drop: "Section: drop—one sharp, decisive move aligned with the hit; then sustain.",
  outro: "Section: outro—decelerate, wider or stiller, resolve physical tension.",
} as const satisfies Record<Exclude<MusicSectionId, "none">, string>;

export function musicSectionInjection(id: MusicSectionId): string {
  if (id === "none") return "";
  return MUSIC_ACCENT[id as Exclude<MusicSectionId, "none">] ?? "";
}
