import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import {
  splitStoryIntoScenes,
} from "@/server/services/llm";
import { getAgentModels } from "./shared";

export async function splitScenesJob(job: Job<RenderJobData>) {
  const { videoProjectId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject?.script) throw new Error("No story found to split");

    await updateVideoStatus(videoProjectId, "SCENE_SPLIT");

    const config = videoProject.config ?? {};

    console.log(`[split-scenes] Splitting story into scenes for ${videoProjectId}`);

    const agents = getAgentModels(videoProject);

    let storyInput = videoProject.script;
    if (videoProject.videoType === "music_video") {
      storyInput = `# ${videoProject.title}\n\nGenre: ${videoProject.config!.musicGenre!}\n\n${videoProject.script!.trim()}`;
    }

    const result = await splitStoryIntoScenes(
      storyInput,
      videoProject.style,
      videoProject.language || "en",
      agents.directorModel,
      videoProject.videoType || undefined,
      config.creativeBrief
    );

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));

    for (let i = 0; i < result.scenes.length; i++) {
      await db.insert(schema.videoScenes).values({
        videoProjectId,
        sceneOrder: i,
        sceneTitle: result.scenes[i].sceneTitle,
        directorNote: result.scenes[i].directorNote,
        text: result.scenes[i].text,
      });
    }

    console.log(`[split-scenes] Created ${result.scenes.length} scenes`);

    await renderQueue.add("supervise-script", { videoProjectId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[split-scenes] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
