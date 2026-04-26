import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { generateVisualStyleGuide } from "@/server/services/llm";
import { getAgentModels, mergeProjectConfig } from "./shared";

export async function cinematographyJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "CINEMATOGRAPHY");

    const config = videoProject.config ?? {};
    if (!config.creativeBrief) throw new Error("No creative brief found");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const scenesInput = existingScenes.map((s) => ({
      sceneTitle: s.sceneTitle || "",
      text: s.text,
      directorNote: s.directorNote || "",
    }));

    const agents = getAgentModels(videoProject);

    console.log(`[cinematography] Generating visual style guide for ${videoProjectId}`);

    const styleGuide = await generateVisualStyleGuide(
      scenesInput,
      config.creativeBrief,
      videoProject.style,
      videoProject.videoType,
      agents.cinematographerModel
    );

    await mergeProjectConfig(videoProjectId, { visualStyleGuide: styleGuide });

    console.log(`[cinematography] Style guide ready: medium="${styleGuide.global.medium}", ${styleGuide.perScene.length} scene overrides`);

    await renderQueue.add("storyboard", { videoProjectId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[cinematography] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
