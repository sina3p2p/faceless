import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, resolveStoryAssets } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { superviseScript } from "@/server/services/ai/llm";
import { countNarrationWords, estimateDurationSec } from "@/server/services/ai/llm/pacing";
import { getAgentModels, mergeProjectConfig } from "./shared";

export async function superviseScriptJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "SCRIPT_SUPERVISION");

    const config = videoProject.config ?? {};
    if (!config.creativeBrief) throw new Error("No creative brief found — run executive-produce first");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });
    if (existingScenes.length === 0) throw new Error("No scenes to supervise");

    const assets = await resolveStoryAssets(videoProjectId);
    const supervisorModel = getAgentModels(videoProject.modelSettings, "supervisorModel");

    console.log(`[supervise-script] Supervising ${existingScenes.length} scenes for ${videoProjectId}`);

    const result = await superviseScript(existingScenes, config.creativeBrief, assets, supervisorModel);

    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));
    await db.insert(schema.videoScenes).values(
      result.scenes.map((s, i) => {
        const baseNote = s.directorNote.replace(/^\[Scene function:[^\]]*\]\s*/i, "");
        const surpriseLine = s.surpriseInjection
          ? `\n[Surprise injection: ${s.surpriseInjection}]`
          : "";
        const imageabilityScore = Math.min(5, Math.max(1, Math.round(s.imageabilityScore)));
        return {
          videoProjectId,
          sceneOrder: i,
          sceneTitle: s.sceneTitle,
          speaker: s.speaker ?? null,
          emotion: s.emotion ?? null,
          emotionIntensity: s.emotionIntensity ?? null,
          directorNote: `[Scene function: ${s.sceneFunction}]\n${baseNote}${surpriseLine}`,
          text: s.text,
          estimatedDurationSec: estimateDurationSec(
            countNarrationWords(s.text),
            s.voicePace ?? "standard"
          ),
          imageabilityScore,
        };
      })
    );

    await mergeProjectConfig(videoProjectId, { continuityNotes: result.continuityNotes });

    console.log(
      `[supervise-script] Supervised: ${result.scenes.length} scenes, ` +
        `${result.continuityNotes.characterRegistry.length} characters, ` +
        `${result.continuityNotes.locationRegistry.length} locations`
    );
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[supervise-script] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
