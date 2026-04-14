import { videoStatusEnum } from "@/server/db/schema";

export interface MediaVersion {
  id: string;
  type: string;
  url: string;
  key: string;
  prompt: string | null;
  modelUsed: string | null;
  createdAt: string;
}

export interface Media {
  id: string;
  type: string;
  url: string;
  key: string;
  prompt: string | null;
  modelUsed: string | null;
  createdAt: string;
}

export interface FrameVariant {
  id: string;
  type: string;
  url: string;
  prompt: string | null;
  modelUsed: string | null;
  createdAt: string;
}

export interface SceneFrame {
  id: string;
  frameOrder: number;
  clipDuration: number | null;
  imagePrompt: string | null;
  visualDescription: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  modelUsed?: string | null;
  media?: FrameVariant[];
  imageGeneratedAt?: string | null;
  videoGeneratedAt?: string | null;
  motionGeneratedAt?: string | null;
  imageMediaId?: string | null;
  videoMediaId?: string | null;
}

export interface Scene {
  id: string;
  sceneOrder: number;
  sceneTitle: string | null;
  directorNote: string | null;
  text: string;
  imagePrompt: string | null;
  visualDescription: string | null;
  searchQuery: string | null;
  speaker: string | null;
  duration: number;
  assetUrl: string | null;
  assetType: string | null;
  audioUrl: string | null;
  assetRefs: string[] | null;
  media?: MediaVersion[];
  frames?: SceneFrame[];
}

export interface StoryAssetItem {
  id: string;
  type: "character" | "location" | "prop";
  name: string;
  description: string;
  url: string;
}

export interface VideoDetail {
  id: string;
  seriesId: string;
  title: string | null;
  status: (typeof videoStatusEnum.enumValues)[number];
  duration: number | null;
  script: string | null;
  outputUrl: string | null;
  llmModel: string | null;
  videoModel: string | null;
  imageModel: string | null;
  videoSize: string | null;
  config: {
    pipelineMode?: "manual" | "auto";
    visualStyleGuide?: {
      global: { medium: string; materialLanguage: string; colorPalette: string[]; cameraPhysics: string; defaultLighting: string };
      promptRegions: { subjectPrefix: string; cameraPrefix: string; lightingPrefix: string; backgroundPrefix: string };
      perScene: Array<{ sceneIndex: number; lightingOverride: string | null; paletteOverride: string[] | null; environmentMood: string }>;
    };
    frameBreakdown?: {
      scenes: Array<{
        frames: Array<{
          clipDuration: number;
          shotType: string;
          narrativeIntent: string;
          motionPolicy: string;
          transitionIn: string;
          subjectFocus: string;
          pacingNote: string;
        }>;
      }>;
    };
    continuityNotes?: {
      characterRegistry: Array<{ canonicalName: string; aliases: string[]; appearance: { clothing: string; hair: string; distinguishingFeatures: string }; firstScene: number; presentInScenes: number[] }>;
      locationRegistry: Array<{ canonicalName: string; description: string; timeOfDay: string; lighting: string; presentInScenes: number[] }>;
    };
    creativeBrief?: {
      concept: string;
      tone: string;
      targetAudience: string;
      visualMood: string;
      narrativeArc: string;
    };
  } | null;
  series: { name: string; niche: string; imageModel: string | null; videoModel: string | null; videoSize: string | null; videoType: string; storyAssets?: StoryAssetItem[] };
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface RefinedScene {
  sceneOrder: number;
  sceneTitle?: string;
  directorNote?: string;
  text: string;
  imagePrompt: string;
  visualDescription: string;
  searchQuery: string;
  duration: number;
}

export interface FieldChange {
  field: string;
  old?: string;
  new?: string;
}

export interface SceneChange {
  scene: number;
  type: "modified" | "added" | "removed";
  fields: FieldChange[];
}

export interface SceneUpdates {
  text?: string;
  duration?: number;
  speaker?: string;
  visualDescription?: string;
  sceneTitle?: string;
  directorNote?: string;
}
