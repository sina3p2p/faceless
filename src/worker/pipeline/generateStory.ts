import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { generateStory, generateMusicLyrics, generateBeatSheet } from "@/server/services/ai/llm";
import { getResearchPackForVideo } from "@/server/db/research";
import { getAgentModels, mergeProjectConfig } from "./shared";
import { deriveSubseed } from "@/lib/seed";

export async function generateStoryJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const video = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!video) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "STORY");

    const topicIdea = video.idea;

    if (!topicIdea) {
      throw new Error("No idea found");
    }

    const config = video.config ?? {};

    console.log(`[generate-story] Starting story generation for video=${videoProjectId}`);

    const storyModel = getAgentModels(video.modelSettings, 'storyModel');

    const researchPack =
      config.webResearch === true ? await getResearchPackForVideo(videoProjectId) : null;
    if (config.webResearch === true && (!researchPack || researchPack.claims.length === 0)) {
      throw new Error("Web research is enabled but no research pack was found. Re-run the research step.");
    }

    const isMusic = video.videoType === "music_video";
    const storySeed = video.seed != null ? deriveSubseed(video.seed, "story") : undefined;

    let title: string;
    let scriptPayload: string;

    if (isMusic) {
      const preferred = config.duration?.preferred ?? 60;
      const song = await generateMusicLyrics({
        style: video.style,
        topicIdea,
        language: video.language ?? undefined,
        model: storyModel,
        musicGenreStyle: config.musicGenre,
        researchPack,
        targetDurationSec: preferred,
      });
      title = song.title;
      scriptPayload = song.lyrics;
      console.log(`[generate-story] Music lyrics ready: "${title}" (${scriptPayload.length} chars body)`);
    } else {
      let beatSheet = config.beatSheet;
      if (!beatSheet && config.creativeBrief) {
        console.log(`[generate-story] Designing beat sheet for video=${videoProjectId}`);
        beatSheet = await generateBeatSheet(
          topicIdea,
          video.style,
          config.creativeBrief,
          video.language || "en",
          researchPack,
          storyModel,
        );
        await mergeProjectConfig(videoProjectId, { beatSheet });
        console.log(`[generate-story] Beat sheet: ${beatSheet.beats.length} beats, voice="${beatSheet.voice}"`);
      }

      const storyMarkdown = await generateStory(
        video.style,
        topicIdea,
        video.language,
        storyModel,
        config.creativeBrief,
        researchPack,
        storySeed,
        beatSheet,
      );
      const titleMatch = storyMarkdown.match(/^#\s+(.+)$/m);
      title = titleMatch ? titleMatch[1].trim() : "Untitled";
      scriptPayload = storyMarkdown;
      console.log(`[generate-story] Story ready: "${title}" (${storyMarkdown.length} chars)`);
    }

    await db
      .update(schema.videoProjects)
      .set({ title, script: scriptPayload })
      .where(eq(schema.videoProjects.id, videoProjectId));

    await renderQueue.add("split-scenes", { videoProjectId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
