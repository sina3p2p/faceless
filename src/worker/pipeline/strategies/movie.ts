import * as fs from "fs/promises";
import * as path from "path";
import { db, schema, eq, resolveStoryAssets, execAsync } from "../../shared";
import {
  generateScreenplay,
  renderScreenplayMarkdown,
} from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { listVoices } from "@/server/services/tts";
import { lipSyncClip } from "@/server/services/ai/video";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { downloadFile } from "@/server/services/composer";
import { TTS, LIPSYNC, WORKER } from "@/lib/constants";
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
  ComposeHookInput,
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

  async beforeCompose(input: ComposeHookInput): Promise<void> {
    const project = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, input.videoProjectId),
      columns: { config: true },
    });
    if (project?.config?.lipSyncEnabled ?? true) {
      await applyLipSync(input.videoProjectId, input.userId, input.workDir);
    }
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

interface LipSyncTarget {
  frameId: string;
  videoUrl: string;
  audioSegPath: string;
}

async function ffprobeDurationSafe(file: string): Promise<number> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`
    );
    return parseFloat(stdout.trim()) || 0;
  } catch {
    return 0;
  }
}

/**
 * Lip-sync the speaking-close-up frames to their scene audio. Idempotent —
 * frames whose current clip is already lip-synced are skipped, so re-runs are
 * safe and cheap. Per-frame failures are swallowed: the original clip is kept
 * and compose proceeds. Lip-sync never blocks the render.
 */
async function applyLipSync(
  videoProjectId: string,
  userId: string,
  workDir: string
): Promise<void> {
  if (!LIPSYNC.replicateToken) {
    console.warn("[compose-final] lip-sync skipped: REPLICATE_API_TOKEN not set");
    return;
  }

  const scenes = await db.query.videoScenes.findMany({
    where: eq(schema.videoScenes.videoProjectId, videoProjectId),
    orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
  });

  const targets: LipSyncTarget[] = [];

  for (const scene of scenes) {
    const speaker = scene.speaker?.trim().toLowerCase();
    if (!speaker || speaker === "narrator" || !scene.audioUrl) continue;

    const frames = await db.query.sceneFrames.findMany({
      where: eq(schema.sceneFrames.sceneId, scene.id),
      orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
      with: { videoMedia: true },
    });

    const flagged = frames.filter(
      (f) => f.isSpeakingCloseup && f.videoMediaId && f.videoMedia?.url
    );
    if (flagged.length === 0) continue;

    const sceneAudioPath = path.join(workDir, `lipsync_audio_${scene.id}.mp3`);
    try {
      await downloadFile(mediaUrl(scene.audioUrl), sceneAudioPath);
    } catch (err) {
      console.warn(
        `[compose-final] lip-sync: scene ${scene.id} audio download failed (${err instanceof Error ? err.message : err}) — skipping scene`
      );
      continue;
    }
    const audioDur = await ffprobeDurationSafe(sceneAudioPath);
    if (audioDur <= 0) continue;

    let cursor = 0;
    for (const frame of frames) {
      const clip = frame.clipDuration ?? 5;
      const isFlagged = flagged.some((f) => f.id === frame.id);
      const single = frames.length === 1;
      const start = single ? 0 : Math.min(cursor, audioDur);
      const end = single ? audioDur : Math.min(cursor + clip, audioDur);
      cursor += clip;

      if (!isFlagged) continue;

      const meta = frame.videoMedia?.metadata as { lipSync?: boolean; nativeLipSync?: boolean } | null;
      if (meta?.lipSync === true || meta?.nativeLipSync === true) continue;
      if (end - start < 0.3) continue;

      const audioSegPath = path.join(workDir, `lipsync_seg_${frame.id}.mp3`);
      try {
        await execAsync(
          `ffmpeg -y -hide_banner -i "${sceneAudioPath}" -ss ${start.toFixed(3)} -to ${end.toFixed(3)} ` +
            `-c:a libmp3lame -q:a 4 "${audioSegPath}"`
        );
      } catch {
        continue;
      }
      targets.push({
        frameId: frame.id,
        videoUrl: mediaUrl(frame.videoMedia!.url),
        audioSegPath,
      });
    }
  }

  if (targets.length === 0) {
    console.log("[compose-final] lip-sync: no speaking-close-up frames to sync");
    return;
  }

  console.log(`[compose-final] lip-sync: ${targets.length} frame(s)`);

  const BATCH = WORKER.parallelVideos;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (t) => {
        try {
          const segBuffer = await fs.readFile(t.audioSegPath);
          const segKey = `scenes/${videoProjectId}/lipsync_seg_${t.frameId}_${Date.now()}.mp3`;
          await uploadFile(segKey, segBuffer, "audio/mpeg");

          const result = await lipSyncClip(t.videoUrl, mediaUrl(segKey));

          const resp = await fetch(result.videoUrl);
          if (!resp.ok) throw new Error(`download lip-synced clip failed (${resp.status})`);
          const outBuffer = Buffer.from(await resp.arrayBuffer());
          const key = `frames/${videoProjectId}/lipsync_${t.frameId}_${Date.now()}.mp4`;
          await uploadFile(key, outBuffer, "video/mp4");

          const [newMedia] = await db
            .insert(schema.media)
            .values({
              userId,
              frameId: t.frameId,
              type: "video",
              url: key,
              prompt: "lip-sync",
              modelUsed: LIPSYNC.model,
              metadata: { lipSync: true },
            })
            .returning();

          await db
            .update(schema.sceneFrames)
            .set({ videoMediaId: newMedia.id })
            .where(eq(schema.sceneFrames.id, t.frameId));

          console.log(`[compose-final] lip-sync: frame ${t.frameId} synced`);
        } catch (err) {
          console.error(
            `[compose-final] lip-sync: frame ${t.frameId} failed (${err instanceof Error ? err.message : err}) — keeping original clip`
          );
        }
      })
    );
  }
}
