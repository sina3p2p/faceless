import { Job } from "bullmq";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { v4 as uuid } from "uuid";

import {
  db,
  schema,
  eq,
  execAsync,
  updateVideoStatus,
  generateTTSParallel,
  failJob,
  parseStoryAssets,
  resolveStoryAssets,
  filterAssetsByRefs,
  type StoryAssetInput,
} from "./shared";
import { generateSceneImage } from "./mediaJobs";
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL, WORKER, getVideoSize } from "@/lib/constants";
import { generateFramePrompts } from "@/server/services/llm/prompts";
import {
  formatPromptContractLogLine,
  resolveFrameImagePromptWithFallback,
  serializeCanonicalForImageProvider,
} from "@/server/services/llm/prompt-contract";
import {
  generateStory,
  splitStoryIntoScenes,
  generateSingleFrameMotion,
  generateCreativeBrief,
  superviseScript,
  generateVisualStyleGuide,
  generateFrameBreakdown,
} from "@/server/services/llm";
import {
  resolveDuration,
  type DurationPreference,
  type PipelineConfig,
} from "@/lib/types";
import {
  getAIVideoForScene,
} from "@/server/services/ai/video";
import { uploadFile, getSignedDownloadUrl } from "@/lib/storage";
import { downloadFile, composeVideo, type ComposerScene } from "@/server/services/composer";
import {
  generateSong,
  transcribeSong,
  alignLyricsToTranscription,
} from "@/server/services/music";
import { renderQueue } from "@/lib/queue";
import { type AspectRatio } from "@/server/services/media";
import type { RenderJobData } from "@/lib/queue";

function getPipelineMode(config: unknown): "manual" | "auto" {
  if (config && typeof config === "object" && "pipelineMode" in config) {
    return (config as Record<string, unknown>).pipelineMode === "auto" ? "auto" : "manual";
  }
  return "manual";
}

function getModelDurationsArray(videoModel?: string | null): number[] {
  const entry = VIDEO_MODELS.find((m) => m.id === (videoModel || DEFAULT_VIDEO_MODEL));
  return (entry?.durations as number[]) ?? [5, 10];
}

interface AgentModels {
  producerModel?: string;
  storyModel?: string;
  directorModel?: string;
  supervisorModel?: string;
  cinematographerModel?: string;
  storyboardModel?: string;
  promptModel?: string;
  motionModel?: string;
}

function getAgentModels(seriesRecord: { llmModel?: string | null }): AgentModels {
  const override = seriesRecord.llmModel || undefined;
  return {
    producerModel: override,
    storyModel: override,
    directorModel: override,
    supervisorModel: override,
    cinematographerModel: override,
    storyboardModel: override,
    promptModel: override,
    motionModel: override,
  };
}

function getProjectConfig(config: unknown): PipelineConfig {
  if (config && typeof config === "object") return config as PipelineConfig;
  return {};
}

async function loadProjectConfig(videoProjectId: string): Promise<PipelineConfig> {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { config: true },
  });
  return getProjectConfig(project?.config);
}

async function mergeProjectConfig(videoProjectId: string, patch: Partial<PipelineConfig>) {
  const existing = await loadProjectConfig(videoProjectId);
  await db
    .update(schema.videoProjects)
    .set({ config: { ...existing, ...patch } })
    .where(eq(schema.videoProjects.id, videoProjectId));
}

async function autoChainOrReview(
  videoProjectId: string,
  seriesId: string,
  userId: string,
  reviewStatus: typeof schema.videoStatusEnum.enumValues[number],
  nextJobName: string
) {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { config: true },
  });
  const mode = getPipelineMode(project?.config);

  if (mode === "auto") {
    await renderQueue.add(nextJobName, { videoProjectId, seriesId, userId });
  } else {
    await updateVideoStatus(videoProjectId, reviewStatus);
  }
}

// ── Executive Produce ──

export async function executiveProduceJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "PRODUCING");

    const config = await loadProjectConfig(videoProjectId);

    const duration: DurationPreference = config.duration
      ? config.duration
      : resolveDuration({ preferred: 30 });

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea = topicIdeas.length > 0
      ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
      : undefined;

    const previousProjects = await db.query.videoProjects.findMany({
      where: eq(schema.videoProjects.seriesId, seriesId),
      columns: { title: true },
      orderBy: (vp, { desc }) => [desc(vp.createdAt)],
      limit: 50,
    });
    const previousTopics = previousProjects.map((v) => v.title).filter((t): t is string => !!t);

    const storyAssets = (seriesRecord.storyAssets ?? []) as StoryAssetInput[];
    const charImages = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
    const assets = parseStoryAssets(storyAssets, charImages);

    const agents = getAgentModels(seriesRecord);

    console.log(`[executive-produce] Generating creative brief for series=${seriesId}`);

    const brief = await generateCreativeBrief(
      seriesRecord.niche,
      seriesRecord.style,
      seriesRecord.videoType || "standalone",
      seriesRecord.language || "en",
      duration,
      previousTopics,
      topicIdea,
      assets,
      agents.producerModel
    );

    await mergeProjectConfig(videoProjectId, { duration, creativeBrief: brief });

    console.log(`[executive-produce] Brief ready: "${brief.concept}" (${brief.durationGuidance.wordBudgetTarget} target words)`);

    await renderQueue.add("generate-story", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[executive-produce] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Generate Story ──

export async function generateStoryJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "STORY");

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea = topicIdeas.length > 0
      ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
      : undefined;

    const previousProjects = await db.query.videoProjects.findMany({
      where: eq(schema.videoProjects.seriesId, seriesId),
      columns: { title: true },
      orderBy: (vp, { desc }) => [desc(vp.createdAt)],
      limit: 50,
    });
    const previousTopics = previousProjects.map((v) => v.title).filter((t): t is string => !!t);

    const config = await loadProjectConfig(videoProjectId);

    console.log(`[generate-story] Starting story generation for series=${seriesId}`);

    const agents = getAgentModels(seriesRecord);

    const storyMarkdown = await generateStory(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea,
      seriesRecord.language || "en",
      agents.storyModel,
      previousTopics,
      seriesRecord.videoType || undefined,
      config.creativeBrief
    );

    const titleMatch = storyMarkdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

    await db
      .update(schema.videoProjects)
      .set({ title, script: storyMarkdown })
      .where(eq(schema.videoProjects.id, videoProjectId));

    console.log(`[generate-story] Story ready: "${title}" (${storyMarkdown.length} chars)`);

    await renderQueue.add("split-scenes", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Split Scenes ──

export async function splitScenesJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { script: true },
    });
    if (!videoProject?.script) throw new Error("No story found to split");

    await updateVideoStatus(videoProjectId, "SCENE_SPLIT");

    const config = await loadProjectConfig(videoProjectId);

    console.log(`[split-scenes] Splitting story into scenes for ${videoProjectId}`);

    const agents = getAgentModels(seriesRecord);

    const result = await splitStoryIntoScenes(
      videoProject.script,
      seriesRecord.style,
      seriesRecord.language || "en",
      agents.directorModel,
      seriesRecord.videoType || undefined,
      config.creativeBrief
    );

    // Delete any existing scenes before inserting new ones
    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));

    for (let i = 0; i < result.scenes.length; i++) {
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        sceneTitle: result.scenes[i].sceneTitle,
        directorNote: result.scenes[i].directorNote,
        text: result.scenes[i].text,
      });
    }

    console.log(`[split-scenes] Created ${result.scenes.length} scenes`);

    await renderQueue.add("supervise-script", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[split-scenes] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Supervise Script ──

export async function superviseScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "SCRIPT_SUPERVISION");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.creativeBrief) throw new Error("No creative brief found — run executive-produce first");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (existingScenes.length === 0) throw new Error("No scenes to supervise");

    const storyAssets = (seriesRecord.storyAssets ?? []) as StoryAssetInput[];
    const charImages = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
    const assets = parseStoryAssets(storyAssets, charImages);

    const scenesInput = existingScenes.map((s) => ({
      sceneTitle: s.sceneTitle || "",
      text: s.text,
      directorNote: s.directorNote || "",
    }));

    const agents = getAgentModels(seriesRecord);

    console.log(`[supervise-script] Supervising ${scenesInput.length} scenes for ${videoProjectId}`);

    const result = await superviseScript(
      scenesInput,
      config.creativeBrief,
      assets,
      agents.supervisorModel
    );

    // Overwrite scenes with corrected versions
    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));

    for (let i = 0; i < result.scenes.length; i++) {
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        sceneTitle: result.scenes[i].sceneTitle,
        directorNote: result.scenes[i].directorNote,
        text: result.scenes[i].text,
      });
    }

    await mergeProjectConfig(videoProjectId, { continuityNotes: result.continuityNotes });

    console.log(`[supervise-script] Supervised: ${result.scenes.length} scenes, ${result.continuityNotes.characterRegistry.length} characters, ${result.continuityNotes.locationRegistry.length} locations`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_STORY", "generate-tts");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[supervise-script] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Generate TTS (or Song for music_video) ──

export async function generateTTSJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-tts-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "TTS_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes for audio generation");

    const isMusic = seriesRecord.videoType === "music_video";

    if (isMusic) {
      // ── Music: generate song via Suno + Whisper alignment ──
      const videoProject = await db.query.videoProjects.findFirst({
        where: eq(schema.videoProjects.id, videoProjectId),
        columns: { script: true, title: true, config: true },
      });
      const scriptMd = videoProject?.script || "";

      const genreMatch = scriptMd.match(/^Genre:\s*(.+)$/m);
      const genre = genreMatch ? genreMatch[1].trim() : "pop, catchy";
      const title = videoProject?.title || "Untitled";

      const songSections = existingScenes.map((s) => ({
        sectionName: s.sceneTitle || `Section ${s.sceneOrder + 1}`,
        lyrics: s.text.split("\n").filter((l: string) => l.trim()),
        durationMs: (s.duration ?? 10) * 1000,
      }));

      const projectConfig = getProjectConfig(videoProject?.config);
      const targetDurationSec = projectConfig.duration?.preferred;

      console.log(`[generate-tts] Music mode: generating song "${title}" (${genre}), ${songSections.length} sections${targetDurationSec ? `, target ~${targetDurationSec}s` : ""}`);

      const songResult = await generateSong(title, genre, songSections, targetDurationSec);

      // Download and upload song
      const songPath = path.join(workDir, "song.mp3");
      await downloadFile(songResult.audioUrl, songPath);
      const songBuffer = await fs.readFile(songPath);
      const songKey = `scenes/${videoProjectId}/song_${Date.now()}.mp3`;
      await uploadFile(songKey, songBuffer, "audio/mpeg");

      // Transcribe + align
      const whisperWords = await transcribeSong(songResult.audioUrl);
      const totalDurationMs = Math.round(songResult.duration * 1000);
      const alignedSections = alignLyricsToTranscription(songSections, whisperWords, totalDurationMs);

      // Store song URL + alignment in project config
      const existingConfig = ((await db.query.videoProjects.findFirst({
        where: eq(schema.videoProjects.id, videoProjectId),
        columns: { config: true },
      }))?.config ?? {}) as Record<string, unknown>;

      await db
        .update(schema.videoProjects)
        .set({
          duration: Math.round(songResult.duration),
          config: { ...existingConfig, songUrl: songKey, alignedSections },
        })
        .where(eq(schema.videoProjects.id, videoProjectId));

      // Update each scene with aligned timing
      for (let i = 0; i < existingScenes.length; i++) {
        const aligned = alignedSections[i];
        if (!aligned) continue;
        const durationSec = Math.ceil((aligned.endMs - aligned.startMs) / 1000);

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: songKey,
            captionData: aligned.wordTimestamps,
            duration: durationSec,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));

        console.log(`[generate-tts] Section ${i} (${songSections[i].sectionName}): ${durationSec}s`);
      }

      console.log(`[generate-tts] Song generated and aligned (${alignedSections.length} sections, ${songResult.duration.toFixed(1)}s total)`);
    } else {
      // ── Standard TTS ──
      const sceneTexts = existingScenes.map((s) => s.text);
      console.log(`[generate-tts] Generating TTS for ${sceneTexts.length} scenes`);

      const { audioPaths, ttsResults } = await generateTTSParallel(
        sceneTexts,
        seriesRecord.defaultVoiceId ?? undefined,
        workDir
      );

      for (let i = 0; i < existingScenes.length; i++) {
        const audioBuffer = await fs.readFile(audioPaths[i]);
        const audioKey = `scenes/${videoProjectId}/audio_${existingScenes[i].id}_${Date.now()}.mp3`;
        await uploadFile(audioKey, audioBuffer, "audio/mpeg");

        let durationSec = 5;
        try {
          const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPaths[i]}"`
          );
          durationSec = Math.ceil(parseFloat(stdout.trim()) || 5);
        } catch { /* fallback to 5s */ }

        await db
          .update(schema.videoScenes)
          .set({
            audioUrl: audioKey,
            captionData: ttsResults[i].wordTimestamps,
            duration: durationSec,
          })
          .where(eq(schema.videoScenes.id, existingScenes[i].id));

        console.log(`[generate-tts] Scene ${i}: ${durationSec}s audio uploaded`);
      }

      console.log(`[generate-tts] All TTS complete`);
    }

    await renderQueue.add("cinematography", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-tts] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}

// ── Cinematography ──

export async function cinematographyJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "CINEMATOGRAPHY");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.creativeBrief) throw new Error("No creative brief found");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const scenesInput = existingScenes.map((s) => ({
      sceneTitle: s.sceneTitle || "",
      text: s.text,
      directorNote: s.directorNote || "",
    }));

    const agents = getAgentModels(seriesRecord);

    console.log(`[cinematography] Generating visual style guide for ${videoProjectId}`);

    const styleGuide = await generateVisualStyleGuide(
      scenesInput,
      config.creativeBrief,
      seriesRecord.style,
      seriesRecord.videoType || "standalone",
      agents.cinematographerModel
    );

    await mergeProjectConfig(videoProjectId, { visualStyleGuide: styleGuide });

    console.log(`[cinematography] Style guide ready: medium="${styleGuide.global.medium}", ${styleGuide.perScene.length} scene overrides`);

    await renderQueue.add("storyboard", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[cinematography] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Storyboard ──

export async function storyboardJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "STORYBOARD");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.creativeBrief) throw new Error("No creative brief found");
    if (!config.continuityNotes) throw new Error("No continuity notes found");

    const duration: DurationPreference = config.duration ?? resolveDuration({ preferred: 30 });
    const supportedDurations = getModelDurationsArray(seriesRecord.videoModel);

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const scenesInput = existingScenes.map((s) => ({
      sceneTitle: s.sceneTitle || "",
      text: s.text,
      directorNote: s.directorNote || "",
      ttsDuration: s.duration ?? 5,
    }));

    const agents = getAgentModels(seriesRecord);

    console.log(`[storyboard] Generating frame breakdown for ${videoProjectId} (${scenesInput.length} scenes, durations: ${JSON.stringify(supportedDurations)})`);

    const breakdown = await generateFrameBreakdown(
      scenesInput,
      supportedDurations,
      config.creativeBrief,
      duration,
      config.continuityNotes,
      agents.storyboardModel
    );

    await mergeProjectConfig(videoProjectId, { frameBreakdown: breakdown });

    const totalFrames = breakdown.scenes.reduce((sum, s) => sum + s.frames.length, 0);
    console.log(`[storyboard] Frame breakdown ready: ${totalFrames} frames across ${breakdown.scenes.length} scenes`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_PRE_PRODUCTION", "generate-prompts");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[storyboard] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Generate Frame Prompts ──

export async function generatePromptsJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "PROMPT_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes for prompt generation");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.visualStyleGuide) throw new Error("No visual style guide found — run cinematography first");
    if (!config.frameBreakdown) throw new Error("No frame breakdown found — run storyboard first");
    if (!config.continuityNotes) throw new Error("No continuity notes found — run supervise-script first");

    const storyAssets = (seriesRecord.storyAssets ?? []) as StoryAssetInput[];
    const charImages = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
    const assets = parseStoryAssets(storyAssets, charImages);

    const scenesInput = existingScenes.map((s) => ({
      text: s.text,
      directorNote: s.directorNote || "",
      sceneTitle: s.sceneTitle || "",
    }));

    const agents = getAgentModels(seriesRecord);

    console.log(`[generate-prompts] Generating frame prompts for ${scenesInput.length} scenes`);

    const result = await generateFramePrompts(
      scenesInput,
      assets,
      config.visualStyleGuide,
      config.frameBreakdown,
      config.continuityNotes,
      agents.promptModel
    );

    // Delete existing frames before inserting
    for (const scene of existingScenes) {
      await db.delete(schema.sceneFrames).where(eq(schema.sceneFrames.sceneId, scene.id));
    }

    let totalFrames = 0;
    for (let i = 0; i < existingScenes.length; i++) {
      const sceneFrames = result.scenes[i]?.frames ?? [];
      const frameSpecs = config.frameBreakdown.scenes[i]?.frames ?? [];
      for (let j = 0; j < sceneFrames.length; j++) {
        const subjectFocus = frameSpecs[j]?.subjectFocus ?? "";
        const frameSpec = frameSpecs[j];
        if (!frameSpec) {
          throw new Error(`Missing frame spec for scene ${i} frame ${j}`);
        }
        const { imagePrompt, assessment } = resolveFrameImagePromptWithFallback({
          primaryImagePrompt: sceneFrames[j].imagePrompt,
          subjectFocus,
          characterRegistry: config.continuityNotes.characterRegistry,
          providerProfile: agents.promptModel ?? "prompt-model",
          styleGuide: config.visualStyleGuide,
          sceneIndex: i,
          frameSpec,
          mergeReasonCodes: sceneFrames[j].mergeReasonCodes,
        });
        if (
          assessment.finalStatus === "failed" ||
          assessment.finalStatus === "degraded" ||
          assessment.finalStatus === "fallback"
        ) {
          console.warn(
            formatPromptContractLogLine(assessment.resultMeta, {
              videoProjectId,
              sceneIndex: i,
              frameIndex: j,
            })
          );
        }

        await db.insert(schema.sceneFrames).values({
          sceneId: existingScenes[i].id,
          frameOrder: j,
          clipDuration: sceneFrames[j].clipDuration,
          imagePrompt,
          imageSpec: sceneFrames[j].imageSpec,
          promptContractMeta: assessment.resultMeta,
          assetRefs: sceneFrames[j].assetRefs,
        });
        totalFrames++;
      }
    }

    console.log(`[generate-prompts] Created ${totalFrames} frames across ${existingScenes.length} scenes`);

    await renderQueue.add("generate-frame-images", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-prompts] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Generate Frame Images ──

export async function generateFrameImagesJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "IMAGE_GENERATION");

    const imageModel = seriesRecord.imageModel || "dall-e-3";
    const sizeConfig = getVideoSize(seriesRecord.videoSize);
    const ar = sizeConfig.id as AspectRatio;

    const allAssets = await resolveStoryAssets(
      seriesRecord.storyAssets as Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string; sheetUrl?: string }> | null,
      seriesRecord.characterImages as Array<{ url: string; description: string }> | null
    );

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const allFrames: Array<{ frame: typeof schema.sceneFrames.$inferSelect & { imageMedia: typeof schema.media.$inferSelect | null }; sceneIdx: number }> = [];
    for (let i = 0; i < existingScenes.length; i++) {
      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, existingScenes[i].id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { imageMedia: true },
      });
      for (const frame of frames) {
        allFrames.push({ frame, sceneIdx: i });
      }
    }

    const targets = allFrames.filter(({ frame }) => !frame.imageMediaId);

    if (targets.length === 0) {
      console.log(`[generate-frame-images] All frames already have images`);
      await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_IMAGES", "generate-pipeline-motion");
      return;
    }

    console.log(`[generate-frame-images] Generating ${targets.length} images sequentially with chain-referencing, ${imageModel}, ${allAssets.length} story assets`);

    let previousFrameSignedUrl: string | null = null;

    const firstTargetIdx = allFrames.findIndex(({ frame }) => frame.id === targets[0].frame.id);
    if (firstTargetIdx > 0) {
      const prevFrame = allFrames[firstTargetIdx - 1].frame;
      if (prevFrame.imageMedia?.url) {
        try { previousFrameSignedUrl = await getSignedDownloadUrl(prevFrame.imageMedia.url); } catch { /* skip */ }
      }
    }

    for (let i = 0; i < targets.length; i++) {
      const { frame, sceneIdx } = targets[i];
      const canonicalPrompt = frame.imagePrompt || `Scene ${sceneIdx + 1}`;
      const { providerPrompt: prompt } = serializeCanonicalForImageProvider(canonicalPrompt);
      const frameAssetRefs = frame.assetRefs as string[] | null;
      const matchedAssets = filterAssetsByRefs(allAssets, frameAssetRefs);

      // Build refs: prefer sheetUrl (character sheet) over original url
      const sceneRefs = matchedAssets.map((a) => ({
        ...a,
        url: a.sheetUrl || a.url,
      }));

      // Add previous frame as chain reference for consistency
      if (previousFrameSignedUrl) {
        sceneRefs.push({
          id: "prev-frame",
          type: "character" as const,
          name: "previous_frame",
          description: "Previous frame — maintain visual consistency, same characters and style",
          url: previousFrameSignedUrl,
        });
      }

      try {
        const result = await generateSceneImage(prompt, imageModel, sceneIdx, sceneRefs, ar);

        const imgResp = await fetch(result.url);
        if (!imgResp.ok) throw new Error("Failed to download generated image");
        const buffer = Buffer.from(await imgResp.arrayBuffer());

        const key = `frames/${videoProjectId}/frame_${frame.id}_${Date.now()}.jpg`;
        await uploadFile(key, buffer, "image/jpeg");

        const [newMedia] = await db.insert(schema.media).values({
          frameId: frame.id,
          type: "image",
          url: key,
          prompt,
          modelUsed: imageModel,
        }).returning();

        await db
          .update(schema.sceneFrames)
          .set({ imageMediaId: newMedia.id, modelUsed: imageModel })
          .where(eq(schema.sceneFrames.id, frame.id));

        previousFrameSignedUrl = await getSignedDownloadUrl(key);

        console.log(`[generate-frame-images] Frame ${i + 1}/${targets.length} (scene ${sceneIdx}) done`);
      } catch (err) {
        console.error(`[generate-frame-images] Frame ${frame.id} failed:`, err);
        // Don't update previousFrameSignedUrl — next frame will use the last successful one
      }

      const progress = Math.round(((i + 1) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    console.log(`[generate-frame-images] All ${targets.length} images generated`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_IMAGES", "generate-pipeline-motion");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[generate-frame-images] Failed for ${videoProjectId}:`, errorMessage);
    await updateVideoStatus(videoProjectId, "FAILED");
    throw error;
  }
}

// ── Generate Motion ──

export async function generateMotionJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "MOTION_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const allFrameData: Array<{
      frameId: string;
      clipDuration: number;
      sceneText: string;
      imageUrl: string;
    }> = [];

    for (let i = 0; i < existingScenes.length; i++) {
      const scene = existingScenes[i];
      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, scene.id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { imageMedia: true },
      });

      for (const frame of frames) {
        let signedUrl = "";
        if (frame.imageMedia?.url) {
          try {
            signedUrl = await getSignedDownloadUrl(frame.imageMedia.url);
          } catch { /* skip */ }
        }

        allFrameData.push({
          frameId: frame.id,
          clipDuration: frame.clipDuration ?? 5,
          sceneText: scene.text,
          imageUrl: signedUrl,
        });
      }
    }

    if (allFrameData.length === 0) {
      console.log(`[generate-motion] No frames found, skipping`);
      await renderQueue.add("generate-frame-videos", { videoProjectId, seriesId, userId });
      return;
    }

    const config = await loadProjectConfig(videoProjectId);
    const styleGuide = config.visualStyleGuide;
    const frameBreakdown = config.frameBreakdown;

    const cameraPhysics = styleGuide?.global?.cameraPhysics ?? "";
    const materialLanguage = styleGuide?.global?.materialLanguage ?? "";

    const framesToProcess = allFrameData;

    console.log(`[generate-motion] Generating motion for ${framesToProcess.length} frames across ${existingScenes.length} scenes`);

    const agents = getAgentModels(seriesRecord);
    const BATCH_SIZE = WORKER.parallelImages;

    // Build a global frame index to scene/frame mapping for looking up frame specs
    let globalFrameIdx = 0;
    const frameSpecMap: Map<number, { sceneIdx: number; frameIdx: number }> = new Map();
    for (let si = 0; si < existingScenes.length; si++) {
      const sceneFrameCount = (await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, existingScenes[si].id),
      })).length;
      for (let fi = 0; fi < sceneFrameCount; fi++) {
        frameSpecMap.set(globalFrameIdx++, { sceneIdx: si, frameIdx: fi });
      }
    }

    for (let i = 0; i < framesToProcess.length; i += BATCH_SIZE) {
      const batch = framesToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frameData, batchIdx) => {
          const globalIdx = i + batchIdx;
          const currentImageUrl = frameData.imageUrl;
          const nextImageUrl = globalIdx + 1 < allFrameData.length
            ? allFrameData[globalIdx + 1].imageUrl
            : null;

          if (!currentImageUrl) {
            console.warn(`[generate-motion] Frame ${frameData.frameId} has no image, skipping`);
            return;
          }

          // Extract narrow contract fields from frame breakdown
          const mapping = frameSpecMap.get(globalIdx);
          const frameSpec = mapping
            ? frameBreakdown?.scenes?.[mapping.sceneIdx]?.frames?.[mapping.frameIdx]
            : undefined;

          try {
            const result = await generateSingleFrameMotion(
              {
                clipDuration: frameData.clipDuration,
                motionPolicy: frameSpec?.motionPolicy ?? "moderate",
                transitionIn: frameSpec?.transitionIn ?? "cut",
                isLastFrame: globalIdx === allFrameData.length - 1,
                sceneText: frameData.sceneText,
                cameraPhysics,
                materialLanguage,
              },
              currentImageUrl,
              nextImageUrl,
              agents.motionModel
            );

            await db
              .update(schema.sceneFrames)
              .set({ visualDescription: result.visualDescription })
              .where(eq(schema.sceneFrames.id, frameData.frameId));

            console.log(`[generate-motion] Frame ${globalIdx + 1}/${framesToProcess.length} done`);
          } catch (err) {
            console.error(`[generate-motion] Frame ${frameData.frameId} failed:`, err instanceof Error ? err.message : err);
          }
        })
      );

      const progress = Math.round(((i + batch.length) / framesToProcess.length) * 100);
      await job.updateProgress(progress);
    }

    console.log(`[generate-motion] Motion descriptions ready`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_MOTION", "generate-frame-videos");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-motion] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Generate Frame Videos ──

export async function generateFrameVideosJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "VIDEO_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    type FrameWithMedia = typeof schema.sceneFrames.$inferSelect & { imageMedia: typeof schema.media.$inferSelect | null };
    const allFrames: Array<{ frame: FrameWithMedia; sceneIdx: number }> = [];
    for (let i = 0; i < existingScenes.length; i++) {
      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, existingScenes[i].id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { imageMedia: true },
      });
      for (const frame of frames) {
        allFrames.push({ frame, sceneIdx: i });
      }
    }

    const targets = allFrames.filter(({ frame }) => !frame.videoMediaId && frame.imageMediaId);

    console.log(`[generate-frame-videos] Generating ${targets.length} video clips`);

    const videoModelKey = seriesRecord.videoModel || undefined;
    const BATCH_SIZE = WORKER.parallelVideos;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async ({ frame, sceneIdx }) => {
          try {
            const imageSignedUrl = await getSignedDownloadUrl(frame.imageMedia!.url);
            const videoPrompt = frame.visualDescription
              || `Cinematic motion, smooth camera movement.`;
            const desiredDuration = Math.max(3, Math.round(frame.clipDuration ?? 5));

            console.log(`[generate-frame-videos] Frame ${frame.id} (scene ${sceneIdx}): ${desiredDuration}s clip`);

            const videoResult = await getAIVideoForScene(imageSignedUrl, videoPrompt, desiredDuration, videoModelKey);

            const videoResp = await fetch(videoResult.videoUrl);
            if (!videoResp.ok) throw new Error("Failed to download video");
            const videoBuffer = Buffer.from(await videoResp.arrayBuffer());

            const key = `frames/${videoProjectId}/video_${frame.id}_${Date.now()}.mp4`;
            await uploadFile(key, videoBuffer, "video/mp4");

            const [newMedia] = await db.insert(schema.media).values({
              frameId: frame.id,
              type: "video",
              url: key,
              prompt: videoPrompt,
              modelUsed: videoModelKey || "kling-3-standard",
            }).returning();

            await db
              .update(schema.sceneFrames)
              .set({ videoMediaId: newMedia.id })
              .where(eq(schema.sceneFrames.id, frame.id));
          } catch (err) {
            console.error(`[generate-frame-videos] Frame ${frame.id} (scene ${sceneIdx}) failed:`, err instanceof Error ? err.message : err);
          }
        })
      );

      const progress = Math.round(((i + batch.length) / targets.length) * 100);
      await job.updateProgress(progress);
    }

    const updatedFrames = await Promise.all(
      targets.map(async ({ frame }) => {
        const f = await db.query.sceneFrames.findFirst({ where: eq(schema.sceneFrames.id, frame.id), columns: { videoMediaId: true } });
        return !!f?.videoMediaId;
      })
    );
    const succeeded = updatedFrames.filter(Boolean).length;
    const failed = targets.length - succeeded;

    console.log(`[generate-frame-videos] ${succeeded}/${targets.length} clips generated${failed > 0 ? ` (${failed} failed — content moderation or other error)` : ""}`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_PRODUCTION", "compose-final");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-frame-videos] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

// ── Compose Final Video ──

export async function composeFinalJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;
  const workDir = path.join(os.tmpdir(), `faceless-compose-${uuid()}`);
  await fs.mkdir(workDir, { recursive: true });

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "RENDERING");

    const sizeConfig = getVideoSize(seriesRecord.videoSize);

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const composerScenes: ComposerScene[] = [];

    for (let i = 0; i < existingScenes.length; i++) {
      const scene = existingScenes[i];

      // Download scene audio
      let audioPath: string | undefined;
      if (scene.audioUrl) {
        const audioSignedUrl = await getSignedDownloadUrl(scene.audioUrl);
        audioPath = path.join(workDir, `audio_${i}.mp3`);
        await downloadFile(audioSignedUrl, audioPath);
      }

      const frames = await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, scene.id),
        orderBy: (sf, { asc }) => [asc(sf.frameOrder)],
        with: { videoMedia: true },
      });

      const frameMediaPaths: string[] = [];
      const frameDurations: number[] = [];

      for (let j = 0; j < frames.length; j++) {
        const frame = frames[j];
        if (frame.videoMedia?.url) {
          const videoSignedUrl = await getSignedDownloadUrl(frame.videoMedia.url);
          const videoPath = path.join(workDir, `scene_${i}_frame_${j}.mp4`);
          await downloadFile(videoSignedUrl, videoPath);
          frameMediaPaths.push(videoPath);
          frameDurations.push(frame.clipDuration ?? 5);
        }
      }

      if (frameMediaPaths.length === 0) continue;

      // For the composer, we create one ComposerScene per scene
      // The media is the concatenated frame videos
      // If multiple frames, concatenate them into one clip
      let mediaPath: string;
      if (frameMediaPaths.length === 1) {
        mediaPath = frameMediaPaths[0];
      } else {
        const concatFile = path.join(workDir, `concat_${i}.txt`);
        const concatContent = frameMediaPaths.map((p) => `file '${p}'`).join("\n");
        await fs.writeFile(concatFile, concatContent);
        mediaPath = path.join(workDir, `scene_${i}_combined.mp4`);
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${mediaPath}"`);
      }

      const totalDuration = frameDurations.reduce((a, b) => a + b, 0);
      const wordTimestamps = (scene.captionData as Array<{ word: string; start: number; end: number }>) || [];

      composerScenes.push({
        text: scene.text,
        audioPath: audioPath || "",
        mediaPath,
        mediaType: "video",
        duration: totalDuration,
        wordTimestamps,
      });
    }

    if (composerScenes.length === 0) throw new Error("No scenes to compose");

    // For music videos, download the global song and pass as globalAudioPath
    const isMusic = seriesRecord.videoType === "music_video";
    let globalAudioPath: string | undefined;
    if (isMusic) {
      const projectConfig = ((await db.query.videoProjects.findFirst({
        where: eq(schema.videoProjects.id, videoProjectId),
        columns: { config: true },
      }))?.config ?? {}) as Record<string, unknown>;
      const songKey = projectConfig.songUrl as string | undefined;
      if (songKey) {
        const songSignedUrl = await getSignedDownloadUrl(songKey);
        globalAudioPath = path.join(workDir, "global_song.mp3");
        await downloadFile(songSignedUrl, globalAudioPath);
      }
    }

    console.log(`[compose-final] Composing ${composerScenes.length} scenes${isMusic ? " (music video, global audio)" : ""}`);

    const outputPath = await composeVideo({
      scenes: composerScenes,
      videoWidth: sizeConfig.width,
      videoHeight: sizeConfig.height,
      captionStyle: seriesRecord.captionStyle || "none",
      globalAudioPath,
    });

    const outputBuffer = await fs.readFile(outputPath);
    const s3Key = `output/${videoProjectId}/video_${Date.now()}.mp4`;
    await uploadFile(s3Key, outputBuffer, "video/mp4");

    await updateVideoStatus(videoProjectId, "COMPLETED", { outputUrl: s3Key });

    console.log(`[compose-final] Video complete: ${s3Key}`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[compose-final] Failed for ${videoProjectId}:`, msg);
    throw error;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => { });
  }
}
