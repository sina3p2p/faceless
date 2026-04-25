import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { resolveDuration, type DurationPreference } from "@/types/pipeline";
import { generateCreativeBrief } from "@/server/services/llm";
import { getAgentModels, loadProjectConfig, mergeProjectConfig } from "./shared";
import { getStoryAssetInputsForVideoProject } from "@/server/db/story-assets";

export async function executiveProduceJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const video = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!video) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "PRODUCING");

    const config = await loadProjectConfig(videoProjectId);

    const duration: DurationPreference = config.duration
      ? config.duration
      : resolveDuration({ preferred: 30 });

    const topicIdea = video.idea;

    if (!topicIdea) throw new Error("No idea found");

    const assets = await getStoryAssetInputsForVideoProject(videoProjectId);

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

    const afterBrief = await loadProjectConfig(videoProjectId);
    if (afterBrief.webResearch) {
      await renderQueue.add("web-research", { videoProjectId, userId });
    } else {
      await renderQueue.add("generate-story", { videoProjectId, userId });
    }
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[executive-produce] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
