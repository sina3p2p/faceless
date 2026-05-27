import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, resolveStoryAssets } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { splitStoryIntoScenes } from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { getAgentModels } from "./shared";
import type { PipelineConfig } from "@/types/pipeline";

export async function splitScenesDirectorJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject?.script) throw new Error("No story found to split");

    await updateVideoStatus(videoProjectId, "SCENE_SPLIT");

    const config = (videoProject.config ?? {}) as PipelineConfig;
    const directorModel = getAgentModels(videoProject.modelSettings, "directorModel");
    const assets = await resolveStoryAssets(videoProjectId);

    // Music videos prepend genre context for the director.
    const storyText =
      videoProject.videoType === "music_video" && config.musicGenre
        ? `# ${videoProject.title}\n\nGenre: ${config.musicGenre}\n\n${videoProject.script.trim()}`
        : videoProject.script;

    console.log(`[split-scenes] Splitting story into scenes for ${videoProjectId}`);

    const result = await splitStoryIntoScenes(
      storyText,
      videoProject.style,
      videoProject.language || "en",
      directorModel,
      videoProject.videoType || undefined,
      config.creativeBrief,
      assets
    );

    console.log(`[split-scenes] Created ${result.scenes.length} scenes`);

    const rows = result.scenes.map((s, i) => ({
      videoProjectId,
      sceneOrder: i,
      sceneTitle: s.sceneTitle,
      speaker: s.speaker ?? null,
      directorNote: `[Scene function: ${s.sceneFunction}]\n${s.directorNote}`,
      text: s.text,
      estimatedDurationSec: estimateDurationSec(
        countNarrationWords(s.text),
        s.voicePace ?? "standard"
      ),
    }));

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));
    await db.insert(schema.videoScenes).values(rows);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[split-scenes] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}

export async function splitScenesScreenplayJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;
  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "SCENE_SPLIT");

    const config = (videoProject.config ?? {}) as PipelineConfig;

    // The screenwriter already authored structured scenes — map them directly,
    // skipping the director's text re-segmentation.
    if (!config.screenplay?.scenes?.length) {
      throw new Error("No screenplay found — run generate-story:screenplay first");
    }

    const screenplayScenes = config.screenplay.scenes;
    console.log(
      `[split-scenes] Movie: mapped ${screenplayScenes.length} screenplay scenes (director split skipped)`
    );

    const rows = screenplayScenes.map((s, i) => ({
      videoProjectId,
      sceneOrder: i,
      sceneTitle: s.sceneTitle,
      speaker: s.speaker ?? null,
      emotion: s.emotion ?? null,
      emotionIntensity: s.emotionIntensity ?? null,
      directorNote: `[Scene function: ${s.sceneFunction}]\n${s.directorNote}${
        s.action?.trim() ? `\n[Action: ${s.action.trim()}]` : ""
      }`,
      text: s.line,
      estimatedDurationSec: estimateDurationSec(
        countNarrationWords(s.line),
        s.voicePace ?? "standard"
      ),
    }));

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));
    await db.insert(schema.videoScenes).values(rows);
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[split-scenes] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
