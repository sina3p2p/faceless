import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { generateStory } from "@/server/services/llm";
import { getAgentModels, loadProjectConfig } from "./shared";

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

    const config = await loadProjectConfig(videoProjectId);

    console.log(`[generate-story] Starting story generation for video=${videoProjectId}`);

    const agents = getAgentModels(video);

    const storyMarkdown = await generateStory(
      video.style,
      topicIdea,
      video.language,
      agents.storyModel,
      video.videoType,
      config.creativeBrief,
      typeof config.musicGenre === "string" ? config.musicGenre : undefined
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
