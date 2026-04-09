import { Job } from "bullmq";

import {
  db,
  schema,
  eq,
  getModelDurations,
  getPreviousTopics,
  updateJobStep,
  updateVideoStatus,
  parseStoryAssets,
  failJob,
  type StoryAssetInput,
} from "./shared";
import {
  generateMusicScript,
  generateStandaloneMusicScript,
} from "@/server/services/llm";
import type { RenderJobData } from "@/lib/queue";

export async function generateMusicScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { config: true },
    });
    const videoConfig = (videoProject?.config ?? {}) as Record<string, unknown>;
    const targetDuration = typeof videoConfig.targetDuration === "number" ? videoConfig.targetDuration : 60;

    console.log(`Music script generation starting for series=${seriesId}, targetDuration=${targetDuration}s`);
    await updateVideoStatus(videoProjectId, "SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const topicIdeas = seriesRecord.topicIdeas as string[];
    const topicIdea =
      topicIdeas.length > 0
        ? topicIdeas[Math.floor(Math.random() * topicIdeas.length)]
        : undefined;

    const previousTopics = await getPreviousTopics(seriesId, videoProjectId);

    const musicScript = await generateMusicScript(
      seriesRecord.niche,
      seriesRecord.style,
      topicIdea,
      targetDuration,
      seriesRecord.llmModel || undefined,
      previousTopics,
      seriesRecord.language || "en",
      getModelDurations(seriesRecord.videoModel)
    );

    await db
      .update(schema.videoProjects)
      .set({
        title: musicScript.title,
        script: JSON.stringify(musicScript),
        duration: musicScript.totalDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (let i = 0; i < musicScript.sections.length; i++) {
      const section = musicScript.sections[i];
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: section.lyrics.join("\n"),
        imagePrompt: section.imagePrompt,
        visualDescription: section.visualDescription,
        searchQuery: section.sectionName,
        duration: Math.round(section.durationMs / 1000),
      });
    }

    await updateVideoStatus(videoProjectId, "REVIEW_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Music script ready for review: ${musicScript.title} (${musicScript.sections.length} sections)`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Music script generation failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

export async function generateStandaloneMusicScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      columns: { config: true },
    });
    const videoConfig = (videoProject?.config ?? {}) as Record<string, unknown>;
    const targetDuration = typeof videoConfig.targetDuration === "number" ? videoConfig.targetDuration : 60;

    const prompt = (seriesRecord.topicIdeas as string[])?.[0] || "";
    const storyAssets2 = (seriesRecord.storyAssets ?? []) as StoryAssetInput[];
    const charImages2 = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
    const characters = parseStoryAssets(storyAssets2, charImages2);

    console.log(`Standalone music script generation starting: prompt="${prompt.slice(0, 80)}...", targetDuration=${targetDuration}s`);
    await updateVideoStatus(videoProjectId, "SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "ACTIVE", 10);
    await job.updateProgress(10);

    const musicScript = await generateStandaloneMusicScript(
      prompt,
      seriesRecord.style,
      characters,
      targetDuration,
      seriesRecord.llmModel || undefined,
      seriesRecord.language || "en",
      getModelDurations(seriesRecord.videoModel)
    );

    await db
      .update(schema.videoProjects)
      .set({
        title: musicScript.title,
        script: JSON.stringify(musicScript),
        duration: musicScript.totalDuration,
      })
      .where(eq(schema.videoProjects.id, videoProjectId));

    for (let i = 0; i < musicScript.sections.length; i++) {
      const section = musicScript.sections[i];
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        text: section.lyrics.join("\n"),
        imagePrompt: section.imagePrompt,
        visualDescription: section.visualDescription,
        searchQuery: section.sectionName,
        duration: Math.round(section.durationMs / 1000),
      });
    }

    await updateVideoStatus(videoProjectId, "REVIEW_SCRIPT");
    await updateJobStep(videoProjectId, "SCRIPT", "COMPLETED", 100);
    await job.updateProgress(100);

    console.log(`Standalone music script ready for review: ${musicScript.title} (${musicScript.sections.length} sections)`);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`Standalone music script generation failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

