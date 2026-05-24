import { db, schema, eq, resolveStoryAssets, execAsync } from "../../shared";
import {
  generateScreenplay,
  renderScreenplayMarkdown,
} from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { listVoices } from "@/server/services/tts";
import { TTS } from "@/lib/constants";
import { deriveSubseed } from "@/lib/seed";
import { mergeProjectConfig } from "../shared";
import { generateMovieDialogueAudio } from "../movieDialogue";
import { persistPerSceneAudio } from "./ttsPersist";
import { StandaloneStrategy } from "./standalone";
import type {
  SceneInsert,
  StoryStageInput,
  StoryStageResult,
  SplitStageInput,
  SuperviseStageInput,
  TtsStageInput,
} from "./types";
import type { VideoType } from "../topology";
import type { CharacterEntry, ContinuityNotes } from "@/types/pipeline";
import type { StoryAssetInput } from "@/types/worker";

/** Dialogue-driven cinematic: cast character voices, screenplay scenes, lip-sync. */
export class MovieStrategy extends StandaloneStrategy {
  readonly videoType: VideoType = "movie";

  async generateStory(input: StoryStageInput): Promise<StoryStageResult> {
    const { project, topicIdea, config, storyModel, researchPack, videoProjectId } = input;
    const storySeed =
      project.seed != null ? deriveSubseed(project.seed, "story") : undefined;

    const beatSheet = await this.ensureBeatSheet(input);
    const assets = await resolveStoryAssets(videoProjectId);
    const screenplay = await generateScreenplay({
      style: project.style,
      topicIdea,
      language: project.language ?? undefined,
      model: storyModel,
      brief: config.creativeBrief,
      researchPack,
      beatSheet,
      assets,
      seed: storySeed,
    });
    await mergeProjectConfig(videoProjectId, { screenplay });
    console.log(
      `[generate-story] Screenplay ready: "${screenplay.title}" (${screenplay.scenes.length} scenes)`
    );
    return { title: screenplay.title, script: renderScreenplayMarkdown(screenplay) };
  }

  async buildScenes(input: SplitStageInput): Promise<SceneInsert[]> {
    const { project, config, videoProjectId } = input;
    // The screenwriter already authored structured scenes with reliable
    // speaker attribution — map them directly and skip the director's text
    // re-segmentation. Falls through to the director split if a movie has no
    // screenplay (e.g. after a plain-text script refine).
    if (project.videoType === "movie" && config.screenplay?.scenes?.length) {
      const screenplayScenes = config.screenplay.scenes;
      console.log(
        `[split-scenes] Movie: mapped ${screenplayScenes.length} screenplay scenes (director split skipped)`
      );
      return screenplayScenes.map((s, i) => ({
        videoProjectId,
        sceneOrder: i,
        sceneTitle: s.sceneTitle,
        speaker: s.speaker ?? null,
        emotion: s.emotion ?? null,
        emotionIntensity: s.emotionIntensity ?? null,
        directorNote: `[Scene function: ${s.sceneFunction}]\n${s.directorNote}${s.action?.trim() ? `\n[Action: ${s.action.trim()}]` : ""}`,
        text: s.line,
        estimatedDurationSec: estimateDurationSec(
          countNarrationWords(s.line),
          s.voicePace ?? "standard"
        ),
      }));
    }
    return super.buildScenes(input);
  }

  async finalizeContinuity(input: SuperviseStageInput): Promise<ContinuityNotes> {
    const { project, continuityNotes, assets } = input;
    return {
      ...continuityNotes,
      characterRegistry: await castCharacterVoices(
        continuityNotes.characterRegistry,
        assets,
        project.voiceId
      ),
    };
  }

  protected perSceneVoiceIds(input: TtsStageInput): (string | undefined)[] | undefined {
    const registry = input.project.config?.continuityNotes?.characterRegistry ?? [];
    const voiceByName = new Map<string, string>();
    for (const c of registry) {
      if (c.voiceId) voiceByName.set(c.canonicalName.toLowerCase(), c.voiceId);
    }
    const ids = input.scenes.map((scene) => {
      const speaker = scene.speaker?.trim();
      if (!speaker || speaker.toLowerCase() === "narrator") return undefined;
      return voiceByName.get(speaker.toLowerCase());
    });
    const distinct = new Set(ids.filter(Boolean)).size;
    console.log(
      `[generate-tts] Movie mode: ${distinct} character voice(s) across ${input.scenes.length} scenes (narrator/default for the rest)`
    );
    return ids;
  }

  async runTts(input: TtsStageInput): Promise<void> {
    const { project, scenes, workDir, videoProjectId } = input;
    const useDialog = (project.config?.movieDialogMode ?? true) && TTS.dialogEnabled;

    if (!useDialog) {
      // Non-dialog movie: standalone path with per-character voices supplied
      // by the overridden perSceneVoiceIds() hook.
      return super.runTts(input);
    }

    const registry = project.config?.continuityNotes?.characterRegistry ?? [];
    console.log(
      `[generate-tts] Movie dialog mode: v3 Text-to-Dialogue for ${scenes.length} scenes`
    );
    const { audioPaths, ttsResults } = await generateMovieDialogueAudio(
      scenes.map((s) => ({
        text: s.text,
        speaker: s.speaker,
        emotion: s.emotion,
        emotionIntensity: s.emotionIntensity,
      })),
      registry,
      project.voiceId,
      workDir
    );
    const emotionMix = scenes.reduce<Record<string, number>>((acc, s) => {
      const key = s.emotion ?? "unset";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    console.log(`[generate-tts] Emotional delivery mix: ${JSON.stringify(emotionMix)}`);

    await persistPerSceneAudio(videoProjectId, scenes, audioPaths, ttsResults);
  }
}

/**
 * Assign a distinct TTS voice to every character so a movie sounds cast, not
 * read by one narrator. User-provided character assets keep their chosen
 * voice; the rest are picked from the ElevenLabs library, gender-matched to
 * voiceProfile when possible, avoiding the project narrator/default voice.
 */
async function castCharacterVoices(
  registry: CharacterEntry[],
  userAssets: StoryAssetInput[],
  projectVoiceId: string | null | undefined
): Promise<CharacterEntry[]> {
  const narratorVoice = projectVoiceId || TTS.defaultVoiceId;

  const userVoiceByName = new Map<string, string>();
  for (const a of userAssets) {
    if (a.type === "character" && a.voiceId) {
      userVoiceByName.set(a.name.toLowerCase(), a.voiceId);
    }
  }

  const pool = await listVoices();
  const taken = new Set<string>([narratorVoice, ...userVoiceByName.values()]);
  const assignable = pool.filter((v) => !taken.has(v.id));

  const used = new Set<string>();
  const pickFromPool = (profile: CharacterEntry["voiceProfile"]): string => {
    if (assignable.length === 0) return narratorVoice;
    const gendered =
      profile === "male" || profile === "female"
        ? assignable.filter((v) => v.gender === profile)
        : [];
    const candidates = gendered.length > 0 ? gendered : assignable;
    const fresh = candidates.find((v) => !used.has(v.id));
    const chosen = fresh ?? candidates[used.size % candidates.length];
    used.add(chosen.id);
    return chosen.id;
  };

  return registry.map((c) => {
    const userVoice = userVoiceByName.get(c.canonicalName.toLowerCase());
    return { ...c, voiceId: userVoice ?? pickFromPool(c.voiceProfile ?? null) };
  });
}
