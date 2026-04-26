import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { generateStory } from "@/server/services/llm";
import { getResearchPackForVideo } from "@/server/db/research";
import { getAgentModels } from "./shared";

export async function generateStoryJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

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

    const agents = getAgentModels(video);

    const researchPack =
      config.webResearch === true ? await getResearchPackForVideo(videoProjectId) : null;
    if (config.webResearch === true && (!researchPack || researchPack.claims.length === 0)) {
      throw new Error("Web research is enabled but no research pack was found. Re-run the research step.");
    }

    const storyMarkdown = await generateStory(
      video.style,
      topicIdea,
      video.language,
      agents.storyModel,
      video.videoType,
      config.creativeBrief,
      typeof config.musicGenre === "string" ? config.musicGenre : undefined,
      researchPack
    );

    const titleMatch = storyMarkdown.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Untitled";

    await db
      .update(schema.videoProjects)
      .set({ title, script: storyMarkdown })
      .where(eq(schema.videoProjects.id, videoProjectId));

    console.log(`[generate-story] Story ready: "${title}" (${storyMarkdown.length} chars)`);

    await renderQueue.add("split-scenes", { videoProjectId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-story] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
