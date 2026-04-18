import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, parseStoryAssets, type StoryAssetInput } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { resolveDuration, type DurationPreference } from "@/lib/types";
import { generateCreativeBrief } from "@/server/services/llm";
import { getAgentModels, loadProjectConfig, mergeProjectConfig } from "./shared";

export async function executiveProduceJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const video = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      with: {
        series: {
          columns: {
            topicIdeas: true,
            storyAssets: true,
            characterImages: true,
          },
        },
      },
    });
    if (!video) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "PRODUCING");

    const config = await loadProjectConfig(videoProjectId);

    const duration: DurationPreference = config.duration
      ? config.duration
      : resolveDuration({ preferred: 30 });

    const topicIdea = video.idea;

    if (!topicIdea) throw new Error("No idea found");

    const storyAssets = (video.series?.storyAssets ?? []) as StoryAssetInput[];
    const charImages = (video.series?.characterImages ?? []) as Array<{ url: string; description: string }>;
    const assets = parseStoryAssets(storyAssets, charImages);

    const agents = getAgentModels(video);

    console.log(`[executive-produce] Generating creative brief for video=${videoProjectId}`);

    const brief = await generateCreativeBrief(
      video.style,
      video.videoType,
      video.language,
      duration,
      topicIdea,
      assets,
      agents.producerModel
    );

    await mergeProjectConfig(videoProjectId, { duration, creativeBrief: brief });

    console.log(`[executive-produce] Brief ready: "${brief.concept}" (${brief.durationGuidance.wordBudgetTarget} target words)`);

    await renderQueue.add("generate-story", { videoProjectId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[executive-produce] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
