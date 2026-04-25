import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { replaceResearchPackWithClaims } from "@/server/db/research";
import { buildResearchPack } from "@/server/services/research/buildResearchPack";
import { loadProjectConfig } from "./shared";

export async function webResearchJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const video = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!video) throw new Error(`Video project not found: ${videoProjectId}`);

    const config = await loadProjectConfig(videoProjectId);
    if (!config.webResearch) {
      throw new Error("webResearch is not enabled for this project");
    }
    if (!config.creativeBrief) {
      throw new Error("No creative brief found — executive-produce must run first");
    }

    const topicIdea = video.idea;
    if (!topicIdea) throw new Error("No idea found");

    await updateVideoStatus(videoProjectId, "RESEARCH");

    console.log(`[web-research] Building research pack for video=${videoProjectId}`);

    const built = await buildResearchPack({
      topicIdea,
      language: video.language,
      videoType: video.videoType,
      brief: config.creativeBrief,
    });

    await replaceResearchPackWithClaims(videoProjectId, built);
    console.log(
      `[web-research] Stored ${built.claims.length} claims (${built.queries.length} queries) for video=${videoProjectId}`
    );

    await renderQueue.add("generate-story", { videoProjectId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[web-research] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
