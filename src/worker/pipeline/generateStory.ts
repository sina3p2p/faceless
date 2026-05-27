import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getResearchPackForVideo } from "@/server/db/research";
import { getAgentModels, mergeProjectConfig } from "./shared";
import {
  generateStory,
  generateBeatSheet,
  generateScreenplay,
  generateMusicLyrics,
  renderScreenplayMarkdown,
} from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { deriveSubseed } from "@/lib/seed";
import { resolveStoryAssets } from "../shared";
import type { PipelineConfig } from "@/types/pipeline";

async function ensureBeatSheet(
  videoProjectId: string,
  project: typeof schema.videoProjects.$inferSelect,
  topicIdea: string,
  config: PipelineConfig,
  storyModel: string,
  researchPack: Awaited<ReturnType<typeof getResearchPackForVideo>> | null
) {
  let beatSheet = config.beatSheet;
  if (!beatSheet && config.creativeBrief) {
    console.log(`[generate-story] Designing beat sheet for video=${videoProjectId}`);
    beatSheet = await generateBeatSheet(
      topicIdea,
      project.style,
      config.creativeBrief,
      project.language || "en",
      storyModel,
      researchPack
    );
    await mergeProjectConfig(videoProjectId, { beatSheet });
    console.log(
      `[generate-story] Beat sheet: ${beatSheet.beats.length} beats, voice="${beatSheet.voice}"`
    );
  }
  return beatSheet;
}

async function loadContext(videoProjectId: string) {
  const video = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
  });
  if (!video) throw new Error(`Video project not found: ${videoProjectId}`);
  const topicIdea = video.idea;
  if (!topicIdea) throw new Error("No idea found");
  const config = video.config ?? {};
  const storyModel = getAgentModels(video.modelSettings, "storyModel");
  const researchPack =
    config.webResearch === true ? await getResearchPackForVideo(videoProjectId) : null;
  if (config.webResearch === true && (!researchPack || researchPack.claims.length === 0)) {
    throw new Error(
      "Web research is enabled but no research pack was found. Re-run the research step."
    );
  }
  return { video, topicIdea, config, storyModel, researchPack };
}

export async function generateStoryVoiceoverJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const { video, topicIdea, config, storyModel, researchPack } = await loadContext(videoProjectId);
    await updateVideoStatus(videoProjectId, "STORY");
    console.log(`[generate-story] Starting voiceover story for video=${videoProjectId}`);

    const storySeed = video.seed != null ? deriveSubseed(video.seed, "story") : undefined;
    const beatSheet = await ensureBeatSheet(videoProjectId, video, topicIdea, config, storyModel, researchPack);

    const storyMarkdown = await generateStory(
      video.style,
      topicIdea,
      video.language,
      storyModel,
      (config as { creativeBrief?: Parameters<typeof generateStory>[4] }).creativeBrief,
      researchPack,
      storySeed,
      beatSheet
    );
    const titleMatch = storyMarkdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";
    console.log(`[generate-story] Story ready: "${title}" (${storyMarkdown.length} chars)`);

    await db
      .update(schema.videoProjects)
      .set({ title, script: storyMarkdown })
      .where(eq(schema.videoProjects.id, videoProjectId));
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

export async function generateStoryLyricsJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const { video, topicIdea, config, storyModel, researchPack } = await loadContext(videoProjectId);
    await updateVideoStatus(videoProjectId, "STORY");

    const preferred = (config as { duration?: { preferred?: number } }).duration?.preferred ?? 60;
    console.log(`[generate-story] Generating music lyrics for video=${videoProjectId}`);

    const song = await generateMusicLyrics({
      style: video.style,
      topicIdea,
      language: video.language ?? undefined,
      model: storyModel,
      musicGenreStyle: (config as { musicGenre?: string }).musicGenre,
      researchPack,
      targetDurationSec: preferred,
    });
    console.log(
      `[generate-story] Music lyrics ready: "${song.title}" (${song.lyrics.length} chars body)`
    );

    await db
      .update(schema.videoProjects)
      .set({ title: song.title, script: song.lyrics })
      .where(eq(schema.videoProjects.id, videoProjectId));
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

export async function generateStoryScreenplayJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const { video, topicIdea, config, storyModel, researchPack } = await loadContext(videoProjectId);
    await updateVideoStatus(videoProjectId, "STORY");
    console.log(`[generate-story] Generating screenplay for video=${videoProjectId}`);

    const storySeed = video.seed != null ? deriveSubseed(video.seed, "story") : undefined;
    const beatSheet = await ensureBeatSheet(videoProjectId, video, topicIdea, config, storyModel, researchPack);
    const assets = await resolveStoryAssets(videoProjectId);

    const screenplay = await generateScreenplay({
      style: video.style,
      topicIdea,
      language: video.language ?? undefined,
      model: storyModel,
      brief: (config as { creativeBrief?: Parameters<typeof generateScreenplay>[0]["brief"] }).creativeBrief,
      researchPack,
      beatSheet,
      assets,
      seed: storySeed,
    });

    await mergeProjectConfig(videoProjectId, { screenplay });
    console.log(
      `[generate-story] Screenplay ready: "${screenplay.title}" (${screenplay.scenes.length} scenes)`
    );

    await db
      .update(schema.videoProjects)
      .set({ title: screenplay.title, script: renderScreenplayMarkdown(screenplay) })
      .where(eq(schema.videoProjects.id, videoProjectId));
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
