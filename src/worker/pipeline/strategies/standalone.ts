import { db, schema, eq, generateTTSParallel } from "../../shared";
import {
  generateStory,
  generateBeatSheet,
  splitStoryIntoScenes,
} from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { emotionToVoiceSettings } from "@/server/services/tts";
import { deriveSubseed } from "@/lib/seed";
import { mergeProjectConfig } from "../shared";
import { persistPerSceneAudio } from "./ttsPersist";
import type {
  ContentStrategy,
  SceneInsert,
  StoryStageInput,
  StoryStageResult,
  SplitStageInput,
  SuperviseStageInput,
  TtsStageInput,
} from "./types";
import type { VideoType } from "../topology";
import type { ContinuityNotes } from "@/types/pipeline";

/**
 * Default behavior. Voiceover-driven narrative short-form. Other strategies
 * extend this and override only the stages where they diverge.
 */
export class StandaloneStrategy implements ContentStrategy {
  readonly videoType: VideoType = "standalone";

  /** Beat sheet generation is shared between standalone and movie. */
  protected async ensureBeatSheet(input: StoryStageInput) {
    const { project, topicIdea, config, storyModel, researchPack, videoProjectId } = input;
    let beatSheet = config.beatSheet;
    if (!beatSheet && config.creativeBrief) {
      console.log(`[generate-story] Designing beat sheet for video=${videoProjectId}`);
      beatSheet = await generateBeatSheet(
        topicIdea,
        project.style,
        config.creativeBrief,
        project.language || "en",
        researchPack,
        storyModel
      );
      await mergeProjectConfig(videoProjectId, { beatSheet });
      console.log(
        `[generate-story] Beat sheet: ${beatSheet.beats.length} beats, voice="${beatSheet.voice}"`
      );
    }
    return beatSheet;
  }

  async generateStory(input: StoryStageInput): Promise<StoryStageResult> {
    const { project, topicIdea, config, storyModel, researchPack } = input;
    const storySeed =
      project.seed != null ? deriveSubseed(project.seed, "story") : undefined;

    const beatSheet = await this.ensureBeatSheet(input);

    const storyMarkdown = await generateStory(
      project.style,
      topicIdea,
      project.language,
      storyModel,
      config.creativeBrief,
      researchPack,
      storySeed,
      beatSheet
    );
    const titleMatch = storyMarkdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";
    console.log(`[generate-story] Story ready: "${title}" (${storyMarkdown.length} chars)`);
    return { title, script: storyMarkdown };
  }

  async buildScenes(input: SplitStageInput): Promise<SceneInsert[]> {
    const { project, config, directorModel, assets, videoProjectId } = input;
    console.log(`[split-scenes] Splitting story into scenes for ${videoProjectId}`);

    const storyInput = this.storyInputForDirector(input);
    const result = await splitStoryIntoScenes(
      storyInput,
      project.style,
      project.language || "en",
      directorModel,
      project.videoType || undefined,
      config.creativeBrief,
      assets
    );

    console.log(`[split-scenes] Created ${result.scenes.length} scenes`);

    return result.scenes.map((s, i) => ({
      videoProjectId,
      sceneOrder: i,
      sceneTitle: s.sceneTitle,
      speaker: s.speaker ?? null,
      directorNote: `[Scene function: ${s.sceneFunction}]\n${s.directorNote}`,
      text: s.text,
      estimatedDurationSec: estimateDurationSec(
        countNarrationWords(s.text),
        s.voicePace ?? "standard"
      ),
    }));
  }

  /** Music overrides this to prepend the genre header. */
  protected storyInputForDirector(input: SplitStageInput): string {
    return input.project.script!;
  }

  async finalizeContinuity(input: SuperviseStageInput): Promise<ContinuityNotes> {
    return input.continuityNotes;
  }

  async runTts(input: TtsStageInput): Promise<void> {
    const { project, scenes, workDir, videoProjectId } = input;
    const sceneTexts = scenes.map((scene) => scene.text);
    console.log(`[generate-tts] Generating TTS for ${sceneTexts.length} scenes`);

    const perSceneVoiceSettings = scenes.map((scene) => ({
      ...emotionToVoiceSettings(scene.emotion, scene.emotionIntensity),
      emotion: scene.emotion,
      emotionIntensity: scene.emotionIntensity,
    }));
    const emotionMix = scenes.reduce<Record<string, number>>((acc, s) => {
      const key = s.emotion ?? "unset";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[generate-tts] Emotional delivery mix: ${JSON.stringify(emotionMix)}`);

    const { audioPaths, ttsResults } = await generateTTSParallel(
      sceneTexts,
      project.voiceId,
      workDir,
      undefined,
      this.perSceneVoiceIds(input),
      perSceneVoiceSettings
    );

    await persistPerSceneAudio(videoProjectId, scenes, audioPaths, ttsResults);
  }

  /** Movie overrides this to map character speakers to cast voices. */
  protected perSceneVoiceIds(_input: TtsStageInput): (string | undefined)[] | undefined {
    void _input;
    return undefined;
  }
}

// Re-export so subclasses can reference db/schema without re-importing.
export { db, schema, eq };
