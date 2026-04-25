// ── Pipeline Agent Contracts ──
// Structured types shared across all pipeline agents.
// These are the source of truth — not prose, not markdown.

import type { MotionSkillHints } from "@/types/motion-skill-hints";
import type { AgentModels } from "@/types/worker-pipeline";

// ── Duration ──

export interface DurationPreference {
  min: number;
  preferred: number;
  max: number;
  priority: "quality" | "duration";
}

export function resolveDuration(input: {
  preferred: number;
  min?: number;
  max?: number;
  priority?: "quality" | "duration";
}): DurationPreference {
  return {
    min: input.min ?? Math.round(input.preferred * 0.7),
    preferred: input.preferred,
    max: input.max ?? Math.round(input.preferred * 1.33),
    priority: input.priority ?? "quality",
  };
}

// ── Executive Producer → CreativeBrief ──

export type NarrationStyle = "voiceover" | "dialogue" | "mixed";
export type OpeningHook = "question" | "claim" | "mystery" | "action";
export type RevealTiming = "early" | "gradual" | "final";
export type ResolutionType = "closed" | "open" | "cliffhanger";
export type DialogueDensity = "none" | "sparse" | "moderate" | "heavy";

export interface FormatConstraints {
  narrationStyle: NarrationStyle;
  openingHook: OpeningHook;
  revealTiming: RevealTiming;
  resolutionType: ResolutionType;
  dialogueDensity: DialogueDensity;
  maxSentencesPerScene: number;
}

export interface CreativeBrief {
  concept: string;
  tone: string;
  targetAudience: string;
  pacingStrategy: string;
  visualMood: string;
  narrativeArc: string;
  durationGuidance: {
    wordBudgetMin: number;
    wordBudgetTarget: number;
    wordBudgetMax: number;
    sceneBudget: { min: number; max: number };
  };
  formatConstraints: FormatConstraints;
}

// ── Script Supervisor → ContinuityNotes ──

export interface CharacterEntry {
  canonicalName: string;
  aliases: string[];
  assetRef: string | null;
  appearance: {
    clothing: string;
    hair: string;
    distinguishingFeatures: string;
  };
  firstScene: number;
  presentInScenes: number[];
}

export interface LocationEntry {
  canonicalName: string;
  assetRef: string | null;
  description: string;
  timeOfDay: string;
  lighting: string;
  presentInScenes: number[];
}

export interface SceneCarryOver {
  fromScene: number;
  toScene: number;
  carriedElements: string[];
  changedElements: string[];
}

export interface ContinuityNotes {
  characterRegistry: CharacterEntry[];
  locationRegistry: LocationEntry[];
  sceneCarryOver: SceneCarryOver[];
}

// ── Cinematographer → VisualStyleGuide ──

export interface VisualStyleGuide {
  global: {
    medium: string;
    materialLanguage: string;
    colorPalette: string[];
    cameraPhysics: string;
    defaultLighting: string;
  };
  promptRegions: {
    subjectPrefix: string;
    cameraPrefix: string;
    lightingPrefix: string;
    backgroundPrefix: string;
  };
  perScene: Array<{
    sceneIndex: number;
    lightingOverride: string | null;
    paletteOverride: string[] | null;
    environmentMood: string;
  }>;
}

// ── Storyboard Agent → FrameBreakdown ──

export type ShotType =
  | "establishing"
  | "wide"
  | "medium"
  | "close-up"
  | "extreme-close-up"
  | "detail"
  | "over-shoulder";

export type NarrativeIntent =
  | "introduce"
  | "build"
  | "climax"
  | "react"
  | "transition"
  | "resolve";

export type MotionPolicy =
  | "static"
  | "subtle"
  | "moderate"
  | "dynamic"
  | "frenetic";

export type TransitionType =
  | "cut"
  | "dissolve"
  | "fade"
  | "match-cut"
  | "whip-pan";

export interface FrameSpec {
  clipDuration: number;
  shotType: ShotType;
  narrativeIntent: NarrativeIntent;
  motionPolicy: MotionPolicy;
  transitionIn: TransitionType;
  subjectFocus: string;
  pacingNote: string;
}

export interface FrameBreakdown {
  scenes: Array<{
    frames: FrameSpec[];
  }>;
}

// ── Motion Director (narrow input) ──

export interface MotionDirectorInput {
  clipDuration: number;
  motionPolicy: MotionPolicy;
  transitionIn: string;
  isLastFrame: boolean;
  sceneText: string;
  cameraPhysics: string;
  materialLanguage: string;
  /** Per-frame skill pack (hook / camera / music / vertical) — see `src/server/prompts/skill-packs`. */
  skillHints?: MotionSkillHints | null;
  /** Storyboard intent — refines effective motion policy with the energy ladder. */
  narrativeIntent?: NarrativeIntent;
  /** Count of `assetRefs` on this frame (reference discipline in skill layer). */
  assetRefCount?: number;
  /**
   * When true, this frame is the default “hook” slot (e.g. first in scene) unless `skillHints.isHookFrame === false`.
   */
  isDefaultHookSlot?: boolean;
}

// ── Pipeline Config (stored in video_projects.config) ──

export interface PipelineConfig {
  pipelineMode?: "manual" | "auto";
  /** Per-pipeline-step OpenRouter model ids; stored when user customizes in create flow. */
  agentModels?: Partial<AgentModels>;
  /** Music-video production style (English) for the song generator; overrides script `Genre:` line when set. */
  musicGenre?: string;
  duration?: DurationPreference;
  creativeBrief?: CreativeBrief;
  continuityNotes?: ContinuityNotes;
  visualStyleGuide?: VisualStyleGuide;
  frameBreakdown?: FrameBreakdown;
  songUrl?: string;
  alignedSections?: unknown;
}
