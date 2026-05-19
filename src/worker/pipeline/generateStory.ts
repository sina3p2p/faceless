import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getResearchPackForVideo } from "@/server/db/research";
import { getAgentModels } from "./shared";
import { getStrategy } from "./strategies";

export async function generateStoryJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const video = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!video) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "STORY");

    const topicIdea = video.idea;
    if (!topicIdea) throw new Error("No idea found");

    const config = video.config ?? {};

    console.log(`[generate-story] Starting story generation for video=${videoProjectId}`);

    const storyModel = getAgentModels(video.modelSettings, 'storyModel');

    const researchPack =
      config.webResearch === true ? await getResearchPackForVideo(videoProjectId) : null;
    if (config.webResearch === true && (!researchPack || researchPack.claims.length === 0)) {
      throw new Error("Web research is enabled but no research pack was found. Re-run the research step.");
    }

    const { title, script } = await getStrategy(video.videoType).generateStory({
      videoProjectId,
      project: video,
      topicIdea,
      config,
      storyModel,
      researchPack,
    });

    await db
      .update(schema.videoProjects)
      .set({ title, script })
      .where(eq(schema.videoProjects.id, videoProjectId));
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
