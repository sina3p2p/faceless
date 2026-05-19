import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, resolveStoryAssets } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { getAgentModels } from "./shared";
import { getStrategy } from "./strategies";

export async function splitScenesJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject?.script) throw new Error("No story found to split");

    await updateVideoStatus(videoProjectId, "SCENE_SPLIT");

    const config = videoProject.config ?? {};
    const directorModel = getAgentModels(videoProject.modelSettings, 'directorModel');
    const assets = await resolveStoryAssets(videoProjectId);

    const rows = await getStrategy(videoProject.videoType).buildScenes({
      videoProjectId,
      project: videoProject,
      config,
      directorModel,
      assets,
    });

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));
    await db.insert(schema.videoScenes).values(rows);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[split-scenes] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
