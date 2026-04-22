import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { generateFrameBreakdown } from "@/server/services/llm";
import { resolveDuration, type DurationPreference } from "@/types/pipeline";
import { getAgentModels, loadProjectConfig, mergeProjectConfig, autoChainOrReview, getModelDurationsArray } from "./shared";

export async function storyboardJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "STORYBOARD");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.creativeBrief) throw new Error("No creative brief found");
    if (!config.continuityNotes) throw new Error("No continuity notes found");

    const duration: DurationPreference = config.duration ?? resolveDuration({ preferred: 30 });
    const supportedDurations = getModelDurationsArray(videoProject.videoModel);

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const scenesInput = existingScenes.map((s) => ({
      sceneTitle: s.sceneTitle || "",
      text: s.text,
      directorNote: s.directorNote || "",
      ttsDuration: s.duration ?? 5,
    }));

    const agents = getAgentModels(videoProject);

    console.log(`[storyboard] Generating frame breakdown for ${videoProjectId} (${scenesInput.length} scenes, durations: ${JSON.stringify(supportedDurations)})`);

    const breakdown = await generateFrameBreakdown(
      scenesInput,
      supportedDurations,
      config.creativeBrief,
      duration,
      config.continuityNotes,
      agents.storyboardModel
    );

    await mergeProjectConfig(videoProjectId, { frameBreakdown: breakdown });

    const totalFrames = breakdown.scenes.reduce((sum, s) => sum + s.frames.length, 0);
    console.log(`[storyboard] Frame breakdown ready: ${totalFrames} frames across ${breakdown.scenes.length} scenes`);

    await autoChainOrReview(videoProjectId, userId, "REVIEW_PRE_PRODUCTION", "generate-prompts");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[storyboard] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
