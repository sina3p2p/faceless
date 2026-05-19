/**
 * Per-video-type behavioral strategies.
 *
 * Topology (../topology.ts) decides WHERE the pipeline goes. A strategy
 * decides WHAT each behaviorally-divergent stage does for a given video type.
 * The stage shells (the worker files) handle HOW results are persisted and
 * own status transitions; they delegate the type-specific work to the
 * strategy resolved from the project's videoType.
 *
 * music_video and movie share standalone's topology but override these hooks;
 * timelapse only diverges at executive-produce (no creative brief) and reuses
 * the standalone audio path.
 */

import type { schema } from "../../shared";
import type { VideoType } from "../topology";
import type {
  PipelineConfig,
  ContinuityNotes,
} from "@/types/pipeline";
import type { ModelSettings } from "@/types/llm-common";
import type { StoryAssetInput } from "@/types/worker";

type VideoProjectRow = typeof schema.videoProjects.$inferSelect;
type VideoSceneRow = typeof schema.videoScenes.$inferSelect;
export type SceneInsert = typeof schema.videoScenes.$inferInsert;

export interface StoryStageInput {
  videoProjectId: string;
  project: VideoProjectRow;
  topicIdea: string;
  config: PipelineConfig;
  storyModel: string;
  researchPack: Awaited<
    ReturnType<typeof import("@/server/db/research")["getResearchPackForVideo"]>
  > | null;
}

export interface StoryStageResult {
  title: string;
  script: string;
}

export interface SplitStageInput {
  videoProjectId: string;
  project: VideoProjectRow;
  config: PipelineConfig;
  directorModel: string;
  assets: StoryAssetInput[];
}

export interface SuperviseStageInput {
  project: VideoProjectRow;
  continuityNotes: ContinuityNotes;
  assets: StoryAssetInput[];
}

export interface TtsStageInput {
  videoProjectId: string;
  project: VideoProjectRow;
  scenes: VideoSceneRow[];
  workDir: string;
}

export interface ComposeHookInput {
  videoProjectId: string;
  userId: string;
  workDir: string;
}

export interface ComposeAudioInput {
  config: PipelineConfig;
  workDir: string;
}

export interface ContentStrategy {
  readonly videoType: VideoType;

  /** executive-produce: timelapse skips creative-brief generation entirely. */
  skipsCreativeBrief(): boolean;

  /** generate-story: produce the title + script body for this type. */
  generateStory(input: StoryStageInput): Promise<StoryStageResult>;

  /** split-scenes: produce scene rows. The shell clears old rows + inserts these. */
  buildScenes(input: SplitStageInput): Promise<SceneInsert[]>;

  /** supervise-script: post-process continuity (movie casts character voices). */
  finalizeContinuity(input: SuperviseStageInput): Promise<ContinuityNotes>;

  /**
   * generate-tts: owns its own persistence. Song generation, movie dialogue,
   * and plain voiceover diverge too far for a meaningful shared tail; the
   * shell only sets up the workDir + status and routes afterward.
   */
  runTts(input: TtsStageInput): Promise<void>;

  /** compose-final: optional pre-pass run before composition (movie lip-sync). */
  beforeCompose?(input: ComposeHookInput): Promise<void>;

  /** compose-final: optional global audio track mixed under all scenes (music song). */
  resolveGlobalAudio?(input: ComposeAudioInput): Promise<string | undefined>;

  /** Used by ModelSettings-aware code paths in strategies. */
  readonly _modelSettings?: ModelSettings;
}
