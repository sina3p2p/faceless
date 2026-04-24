/**
 * Per-frame motion skill pack (no zod — safe for client imports).
 * Used by server prompt injection; not exposed in the product UI.
 */

export type HookPatternId =
  | "none"
  | "macro_reveal"
  | "silence_impact"
  | "color_shift"
  | "whip_reveal"
  | "punch_in"
  | "tension_release"
  | "reveal_held";

export type MusicSectionId =
  | "none"
  | "intro"
  | "verse"
  | "pre_chorus"
  | "chorus"
  | "bridge"
  | "breakdown"
  | "build"
  | "drop"
  | "outro";

export type VerticalPackId = "default" | "cinematic" | "social" | "music" | "ecom" | "brand";

export type CameraPhraseId =
  | "none"
  | "push_in_slow"
  | "pull_back_reveal"
  | "orbit_slight"
  | "dolly_lateral"
  | "whip_pan_settle"
  | "rack_emphasis"
  | "locked_tripod"
  | "drift_handheld"
  | "static_foreground";

export interface MotionSkillHints {
  hookPatternId?: HookPatternId;
  isHookFrame?: boolean;
  musicSectionId?: MusicSectionId;
  cameraPhraseId?: CameraPhraseId;
  verticalPackId?: VerticalPackId;
}

// ── UI options (injection prose lives in server skill-packs) ──

export const HOOK_PATTERN_OPTIONS: { id: HookPatternId; label: string }[] = [
  { id: "none", label: "No hook style" },
  { id: "macro_reveal", label: "Macro → reveal" },
  { id: "silence_impact", label: "Silence → impact" },
  { id: "color_shift", label: "Color / grade shift" },
  { id: "whip_reveal", label: "Whip → settle" },
  { id: "punch_in", label: "Punch-in emphasis" },
  { id: "tension_release", label: "Tension → release" },
  { id: "reveal_held", label: "Long hold → beat" },
];

export const CAMERA_PHRASE_OPTIONS: { id: CameraPhraseId; label: string }[] = [
  { id: "none", label: "No preference" },
  { id: "push_in_slow", label: "Slow push-in" },
  { id: "pull_back_reveal", label: "Pull-back reveal" },
  { id: "orbit_slight", label: "Slight orbit" },
  { id: "dolly_lateral", label: "Lateral dolly" },
  { id: "whip_pan_settle", label: "Whip pan → settle" },
  { id: "rack_emphasis", label: "Rack focus beat" },
  { id: "locked_tripod", label: "Locked tripod" },
  { id: "drift_handheld", label: "Handheld drift" },
  { id: "static_foreground", label: "Static frame, action only" },
];

export const MUSIC_SECTION_OPTIONS: { id: MusicSectionId; label: string }[] = [
  { id: "none", label: "N/A" },
  { id: "intro", label: "Intro" },
  { id: "verse", label: "Verse" },
  { id: "pre_chorus", label: "Pre-chorus" },
  { id: "build", label: "Build" },
  { id: "chorus", label: "Chorus / lift" },
  { id: "drop", label: "Drop" },
  { id: "breakdown", label: "Breakdown" },
  { id: "bridge", label: "Bridge" },
  { id: "outro", label: "Outro" },
];

export const VERTICAL_PACK_OPTIONS: { id: VerticalPackId; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "cinematic", label: "Cinematic" },
  { id: "social", label: "Social / short-form" },
  { id: "music", label: "Music video" },
  { id: "ecom", label: "E-com / product" },
  { id: "brand", label: "Brand story" },
];
