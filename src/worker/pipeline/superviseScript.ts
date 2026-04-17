import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, parseStoryAssets, type StoryAssetInput } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { superviseScript } from "@/server/services/llm";
import { getAgentModels, loadProjectConfig, mergeProjectConfig, autoChainOrReview } from "./shared";

export async function superviseScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
      with: {
        series: { columns: { storyAssets: true, characterImages: true } },
      },
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "SCRIPT_SUPERVISION");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.creativeBrief) throw new Error("No creative brief found — run executive-produce first");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (existingScenes.length === 0) throw new Error("No scenes to supervise");

    const storyAssets = (videoProject.series?.storyAssets ?? []) as StoryAssetInput[];
    const charImages = (videoProject.series?.characterImages ?? []) as Array<{ url: string; description: string }>;
    const assets = parseStoryAssets(storyAssets, charImages);

    const scenesInput = existingScenes.map((s) => ({
      sceneTitle: s.sceneTitle || "",
      text: s.text,
      directorNote: s.directorNote || "",
    }));

    const agents = getAgentModels(videoProject);

    console.log(`[supervise-script] Supervising ${scenesInput.length} scenes for ${videoProjectId}`);

    const result = await superviseScript(
      scenesInput,
      config.creativeBrief,
      assets,
      agents.supervisorModel
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

    await mergeProjectConfig(videoProjectId, { continuityNotes: result.continuityNotes });

    console.log(`[supervise-script] Supervised: ${result.scenes.length} scenes, ${result.continuityNotes.characterRegistry.length} characters, ${result.continuityNotes.locationRegistry.length} locations`);

    await autoChainOrReview(videoProjectId, seriesId, userId, "REVIEW_STORY", "generate-tts");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[supervise-script] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
