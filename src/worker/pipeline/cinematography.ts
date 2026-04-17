import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { generateVisualStyleGuide } from "@/server/services/llm";
import { getAgentModels, loadProjectConfig, mergeProjectConfig } from "./shared";

export async function cinematographyJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "CINEMATOGRAPHY");

    const config = await loadProjectConfig(videoProjectId);
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

    const agents = getAgentModels(seriesRecord);

    console.log(`[cinematography] Generating visual style guide for ${videoProjectId}`);

    const styleGuide = await generateVisualStyleGuide(
      scenesInput,
      config.creativeBrief,
      seriesRecord.style,
      seriesRecord.videoType || "standalone",
      agents.cinematographerModel
    );

    await mergeProjectConfig(videoProjectId, { visualStyleGuide: styleGuide });

    console.log(`[cinematography] Style guide ready: medium="${styleGuide.global.medium}", ${styleGuide.perScene.length} scene overrides`);

    await renderQueue.add("storyboard", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[cinematography] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
