import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob, parseStoryAssets, type StoryAssetInput } from "../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import { generateFramePrompts } from "@/server/services/llm/prompts";
import {
  formatPromptContractLogLine,
  resolveFrameImagePromptWithFallback,
} from "@/server/services/llm/prompt-contract";
import { getAgentModels, loadProjectConfig } from "./shared";

export async function generatePromptsJob(job: Job<RenderJobData>) {
  const { videoProjectId, seriesId, userId } = job.data;

  try {
    const seriesRecord = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (!seriesRecord) throw new Error(`Series not found: ${seriesId}`);

    await updateVideoStatus(videoProjectId, "PROMPT_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    if (existingScenes.length === 0) throw new Error("No scenes for prompt generation");

    const config = await loadProjectConfig(videoProjectId);
    if (!config.visualStyleGuide) throw new Error("No visual style guide found — run cinematography first");
    if (!config.frameBreakdown) throw new Error("No frame breakdown found — run storyboard first");
    if (!config.continuityNotes) throw new Error("No continuity notes found — run supervise-script first");

    const storyAssets = (seriesRecord.storyAssets ?? []) as StoryAssetInput[];
    const charImages = (seriesRecord.characterImages ?? []) as Array<{ url: string; description: string }>;
    const assets = parseStoryAssets(storyAssets, charImages);

    const scenesInput = existingScenes.map((s) => ({
      text: s.text,
      directorNote: s.directorNote || "",
      sceneTitle: s.sceneTitle || "",
    }));

    const agents = getAgentModels(seriesRecord);

    console.log(`[generate-prompts] Generating frame prompts for ${scenesInput.length} scenes`);

    const result = await generateFramePrompts(
      scenesInput,
      assets,
      config.visualStyleGuide,
      config.frameBreakdown,
      config.continuityNotes,
      agents.promptModel
    );

    for (const scene of existingScenes) {
      await db.delete(schema.sceneFrames).where(eq(schema.sceneFrames.sceneId, scene.id));
    }

    let totalFrames = 0;
    for (let i = 0; i < existingScenes.length; i++) {
      const sceneFrames = result.scenes[i]?.frames ?? [];
      const frameSpecs = config.frameBreakdown.scenes[i]?.frames ?? [];
      for (let j = 0; j < sceneFrames.length; j++) {
        const subjectFocus = frameSpecs[j]?.subjectFocus ?? "";
        const frameSpec = frameSpecs[j];
        if (!frameSpec) {
          throw new Error(`Missing frame spec for scene ${i} frame ${j}`);
        }
        const { imagePrompt, assessment } = resolveFrameImagePromptWithFallback({
          primaryImagePrompt: sceneFrames[j].imagePrompt,
          subjectFocus,
          characterRegistry: config.continuityNotes.characterRegistry,
          providerProfile: agents.promptModel ?? "prompt-model",
          styleGuide: config.visualStyleGuide,
          sceneIndex: i,
          frameSpec,
          mergeReasonCodes: sceneFrames[j].mergeReasonCodes,
        });
        if (
          assessment.finalStatus === "failed" ||
          assessment.finalStatus === "degraded" ||
          assessment.finalStatus === "fallback"
        ) {
          console.warn(
            formatPromptContractLogLine(assessment.resultMeta, {
              videoProjectId,
              sceneIndex: i,
              frameIndex: j,
            })
          );
        }

        await db.insert(schema.sceneFrames).values({
          sceneId: existingScenes[i].id,
          frameOrder: j,
          clipDuration: sceneFrames[j].clipDuration,
          imagePrompt,
          imageSpec: sceneFrames[j].imageSpec,
          promptContractMeta: assessment.resultMeta,
          assetRefs: sceneFrames[j].assetRefs,
        });
        totalFrames++;
      }
    }

    console.log(`[generate-prompts] Created ${totalFrames} frames across ${existingScenes.length} scenes`);

    await renderQueue.add("generate-frame-images", { videoProjectId, seriesId, userId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-prompts] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
