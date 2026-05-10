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

// ── Story Architect → BeatSheet ──

export type BeatTonalShift =
  | "intrigue"
  | "tension"
  | "relief"
  | "dread"
  | "wonder"
  | "humor"
  | "grief"
  | "triumph"
  | "unease"
  | "warmth";

export interface StoryBeat {
  name: string;
  purpose: string;
  contentSummary: string;
  tonalShift: BeatTonalShift;
  stakeLevel: number;
  isReversal: boolean;
}

export interface BeatSheet {
  premiseLine: string;
  voice: string;
  beats: StoryBeat[];
}

// ── Director / Supervisor → SceneFunction ──

export type SceneFunction =
  | "setup"
  | "escalate"
  | "reveal"
  | "reversal"
  | "quiet-beat"
  | "climax"
  | "resolve";

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

// ── Hero Asset Extractor ──

export type HeroAssetType = "character" | "location" | "prop";

/** One entity the extractor decided needs a locked visual reference. */
export interface HeroAssetPlanEntry {
  name: string;
  type: HeroAssetType;
  description: string;
  appearance: string;
  sheetPromptHints: string;
  rationale: string;
  /** Storage url or signed url of the generated/uploaded sheet image; populated after generation. */
  sheetUrl?: string;
  /** Story-asset id once persisted; used by storyboard/frame stages to lock identity. */
  assetRef?: string;
}

export interface HeroAssetPlan {
  entries: HeroAssetPlanEntry[];
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

// ── Timelapse planner ──

/**
 * One stage of a real-world process being documented as a timelapse — e.g.
 * "excavators digging the foundation pit" or "rebar grid laid over poured
 * concrete slab". Each stage becomes one scene with one frame in the
 * generated video.
 */
export interface TimelapseStage {
  stageIndex: number;
  /** One-sentence label of what this stage shows. Used for review UI. */
  stageDescription: string;
  /**
   * Image-generation prompt describing the visible state of the worksite at
   * this stage. Already includes the locked-vantage framing (the planner
   * weaves it in). The image worker generates each stage sequentially, using
   * the prior stage's image as a reference, so vantage is preserved.
   */
  imagePrompt: string;
  /**
   * The dominant ambient motion happening at THIS stage — e.g. "excavator
   * buckets swing in steady rhythm, dust plumes rising". Used as the i2v
   * prompt; camera stays locked.
   */
  ambientMotion: string;
  /** Optional voiceover line for this stage. Leave empty to skip narration. */
  voiceoverLine?: string;
  /** Target seconds for this stage's clip; clamped to model-supported durations. */
  durationSeconds: number;
}

export interface TimelapsePlan {
  /**
   * 1-2 sentence anchor describing the camera position, framing, distance,
   * and unchanging environmental anchors that every frame must reproduce.
   */
  lockedVantage: string;
  /** Short label of the process: "30-story tower construction", "ship hull cleaning". */
  processName: string;
  /** Brief description of the location and unchanging surroundings. */
  setting: string;
  stages: TimelapseStage[];
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

export type SfxHint = "whoosh" | "impact" | "hit" | "riser" | "none";

export interface FrameSpec {
  clipDuration: number;
  shotType: ShotType;
  narrativeIntent: NarrativeIntent;
  motionPolicy: MotionPolicy;
  transitionIn: TransitionType;
  subjectFocus: string;
  pacingNote: string;
  sfxHint?: SfxHint;
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
  /**
   * Voiceover words-per-second over this frame's window. Used by the Motion
   * Director to inverse-correlate motion intensity with VO density. 0 (or
   * absent) means no signal — typical for music videos.
   */
  voTempoWps?: number;
}

// ── Web research (DB: research_packs + research_claims) ──

export const RESEARCH_SOURCE_TYPES = [
  "news",
  "blog",
  "wiki",
  "gov",
  "academic",
  "corporate",
  "social",
  "other",
] as const;

export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];

export type ResearchClaimConfidence = "high" | "medium" | "low";

/** One research claim (matches `research_claims` row + pack link). */
export interface ResearchClaim {
  id: string;
  researchPackId: string;
  videoProjectId: string;
  claimOrder: number;
  claimText: string;
  sourceUrl: string;
  evidenceSnippet: string;
  retrievedAt: Date;
  asOfDate: Date | null;
  confidence: ResearchClaimConfidence;
  sourceTitle: string;
  sourceDomain: string;
  sourcePublishedAt: Date | null;
  sourceType: ResearchSourceType | null;
}

/** Pack header + claims (assembled for story LLM and APIs). */
export interface ResearchPackWithClaims {
  id: string;
  videoProjectId: string;
  generatedAt: Date;
  queries: string[];
  searchProvider: string;
  claims: ResearchClaim[];
}

// ── Pipeline Config (stored in video_projects.config) ──

export interface PipelineConfig {
  /** When true, run `web-research` after creative brief and before story. */
  webResearch?: boolean;
  /**
   * When true, the composer mixes per-frame SFX cues from `public/sfx/{type}.mp3`.
   * Defaults to false; missing asset files are skipped with a warning so this
   * is safe to flip on before the asset library lands.
   */
  enableSfx?: boolean;
  pipelineMode?: "manual" | "auto";
  /**
   * When true (default), each generated frame image is checked by a vision LLM
   * for concrete defects (missing required asset, garbled text, severe anatomy
   * artifact, wrong aspect/crop, policy refusal/blank, hard chain-style break)
   * and regenerated up to `imageReviewMaxRetries` times with a corrective hint.
   */
  imageReviewEnabled?: boolean;
  /** Cap on review-driven regeneration attempts per frame; clamped to [1, 3]. Default 3. */
  imageReviewMaxRetries?: number;
  /** Minimum severity that triggers regeneration. Default "hard". */
  imageReviewSeverityFloor?: "hard" | "soft";
  /** Per-pipeline-step OpenRouter model ids; stored when user customizes in create flow. */
  agentModels?: Partial<AgentModels>;
  /** Music-video production style (English) for the song generator; overrides script `Genre:` line when set. */
  musicGenre?: string;
  duration?: DurationPreference;
  creativeBrief?: CreativeBrief;
  beatSheet?: BeatSheet;
  continuityNotes?: ContinuityNotes;
  visualStyleGuide?: VisualStyleGuide;
  /** Hero asset plan + refs produced by the extract-hero-assets agent. */
  heroAssetPlan?: HeroAssetPlan;
  /** name (lowercased) → storyAssets.id, populated for all hero entries that aren't already in characterRegistry/locationRegistry. */
  heroAssetRefs?: Record<string, string>;
  frameBreakdown?: FrameBreakdown;
  songUrl?: string;
  alignedSections?: unknown;
  /**
   * Timelapse-only: the staged process plan generated by the timelapse-plan
   * worker. Replaces creativeBrief / beatSheet / continuityNotes /
   * visualStyleGuide / frameBreakdown for timelapse projects (the slim
   * pipeline doesn't produce those).
   */
  timelapsePlan?: TimelapsePlan;
}
