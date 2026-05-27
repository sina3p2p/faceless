/**
 * Stage registry — the single flat map from StageName to its handler function.
 *
 * Adding a new stage means: register it here, add it to the relevant pipeline
 * in pipelines.ts, and add its StageName to the union in topology.ts.
 * Nothing else needs to change.
 */

import type { Job } from "bullmq";
import type { StageName } from "./topology";
import type { RenderJobData } from "@/lib/queue";

import { executiveProduceJob } from "./executiveProduce";
import { webResearchJob } from "./webResearch";
import {
  generateStoryVoiceoverJob,
  generateStoryLyricsJob,
  generateStoryScreenplayJob,
} from "./generateStory";
import { splitScenesDirectorJob, splitScenesScreenplayJob } from "./splitScenes";
import { superviseScriptJob } from "./superviseScript";
import { castCharacterVoicesJob } from "./castCharacterVoices";
import {
  generateTtsVoiceoverJob,
  generateTtsSongJob,
  generateTtsMovieDialogueJob,
} from "./generateTTS";
import { cinematographyJob } from "./cinematography";
import { extractHeroAssetsJob } from "./extractHeroAssets";
import { storyboardJob } from "./storyboard";
import { generatePromptsJob } from "./generatePrompts";
import { generateFrameImagesJob } from "./generateFrameImages";
import { generateMotionJob } from "./generateMotion";
import { generateFrameVideosJob } from "./generateFrameVideos";
import { generateFrameVideosAudioLipsyncJob } from "./generateFrameVideosAudioLipsync";
import { composeFinalJob } from "./composeFinal";
import { timelapsePlanJob } from "./timelapse/plan";

type StageHandler = (job: Job<RenderJobData>) => Promise<void>;

export const STAGE_REGISTRY: Record<StageName, StageHandler> = {
  "executive-produce": executiveProduceJob,
  "web-research": webResearchJob,
  "generate-story:voiceover": generateStoryVoiceoverJob,
  "generate-story:lyrics": generateStoryLyricsJob,
  "generate-story:screenplay": generateStoryScreenplayJob,
  "split-scenes:director": splitScenesDirectorJob,
  "split-scenes:screenplay": splitScenesScreenplayJob,
  "supervise-script": superviseScriptJob,
  "cast-character-voices": castCharacterVoicesJob,
  "generate-tts:voiceover": generateTtsVoiceoverJob,
  "generate-tts:song": generateTtsSongJob,
  "generate-tts:movie-dialogue": generateTtsMovieDialogueJob,
  "cinematography": cinematographyJob,
  "extract-hero-assets": extractHeroAssetsJob,
  "storyboard": storyboardJob,
  "generate-prompts": generatePromptsJob,
  "generate-frame-images": generateFrameImagesJob,
  "generate-pipeline-motion": generateMotionJob,
  "generate-frame-videos": generateFrameVideosJob,
  "generate-frame-videos:audio-lipsync": generateFrameVideosAudioLipsyncJob,
  "compose-final": composeFinalJob,
  "timelapse-plan": timelapsePlanJob,
};
