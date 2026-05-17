import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, resolveStoryAssets } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import {
  splitStoryIntoScenes,
} from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { getAgentModels } from "./shared";

export async function splitScenesJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject?.script) throw new Error("No story found to split");

    await updateVideoStatus(videoProjectId, "SCENE_SPLIT");

    const config = videoProject.config ?? {};

    // Movie type: the screenwriter already authored structured scenes with
    // reliable speaker attribution — map them directly and skip the director's
    // text re-segmentation. (Falls through to the director split if a movie has
    // no screenplay, e.g. after a plain-text script refine.)
    if (videoProject.videoType === "movie" && config.screenplay?.scenes?.length) {
      const screenplayScenes = config.screenplay.scenes;
      await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));
      await db.insert(schema.videoScenes).values(
        screenplayScenes.map((s, i) => ({
          videoProjectId,
          sceneOrder: i,
          sceneTitle: s.sceneTitle,
          speaker: s.speaker ?? null,
          directorNote: `[Scene function: ${s.sceneFunction}]\n${s.directorNote}${s.action?.trim() ? `\n[Action: ${s.action.trim()}]` : ""}`,
          text: s.line,
          estimatedDurationSec: estimateDurationSec(
            countNarrationWords(s.line),
            s.voicePace ?? "standard"
          ),
        }))
      );
      console.log(`[split-scenes] Movie: mapped ${screenplayScenes.length} screenplay scenes (director split skipped)`);
      await renderQueue.add("supervise-script", { videoProjectId });
      return;
    }

    console.log(`[split-scenes] Splitting story into scenes for ${videoProjectId}`);

    const directorModel = getAgentModels(videoProject.modelSettings, 'directorModel');

    const assets = await resolveStoryAssets(videoProjectId);

    let storyInput = videoProject.script;
    if (videoProject.videoType === "music_video") {
      storyInput = `# ${videoProject.title}\n\nGenre: ${videoProject.config!.musicGenre!}\n\n${videoProject.script!.trim()}`;
    }

    const result = await splitStoryIntoScenes(
      storyInput,
      videoProject.style,
      videoProject.language || "en",
      directorModel,
      videoProject.videoType || undefined,
      config.creativeBrief,
      assets
    );

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));

    await db.insert(schema.videoScenes).values(
      result.scenes.map((s, i) => ({
        videoProjectId,
        sceneOrder: i,
        sceneTitle: s.sceneTitle,
        speaker: s.speaker ?? null,
        directorNote: `[Scene function: ${s.sceneFunction}]\n${s.directorNote}`,
        text: s.text,
        // Server-computed duration — never trust LLM arithmetic. Pause markers
        // are stripped from the word count; the SSML <break> contributes its
        // own time downstream when TTS runs.
        estimatedDurationSec: estimateDurationSec(
          countNarrationWords(s.text),
          s.voicePace ?? "standard"
        ),
      }))
    );

    console.log(`[split-scenes] Created ${result.scenes.length} scenes`);

    await renderQueue.add("supervise-script", { videoProjectId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[split-scenes] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
