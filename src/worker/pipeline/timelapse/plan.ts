import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../../shared";
import { renderQueue } from "@/lib/queue";
import type { RenderJobData } from "@/lib/queue";
import {
  generateTimelapsePlan,
  compileMotionPrompt,
  type FrameMotionSpec,
} from "@/server/services/ai/llm";
import { resolveDuration } from "@/types/pipeline";
import { getAgentModels, mergeProjectConfig, getModelDurationsArray } from "../shared";

/**
 * Pick the supported clip duration closest to `target` (ties go to the
 * shorter value to keep within budget).
 */
function clampToSupportedDuration(target: number, supported: number[]): number {
  if (supported.length === 0) return target;
  let best = supported[0];
  let bestDelta = Math.abs(supported[0] - target);
  for (const s of supported) {
    const d = Math.abs(s - target);
    if (d < bestDelta || (d === bestDelta && s < best)) {
      best = s;
      bestDelta = d;
    }
  }
  return best;
}

/**
 * The slim timelapse pipeline's entry point. Replaces the entire narrative
 * chain (executive-producer brief → story → director → script-supervisor →
 * scenes → cinematographer → hero-assets → storyboard → prompt-architect →
 * motion-director) with a single LLM call that produces an ordered stage
 * plan, then writes scenes/frames pre-populated with everything the shared
 * image-gen and video-gen workers need.
 *
 * Flow after this worker completes:
 *   timelapse-plan → generate-tts → generate-frame-images → generate-frame-videos → compose-final
 *
 * `generate-frame-images` chain-references the previous stage's image, which
 * (for timelapse) preserves the locked vantage across stages naturally — the
 * same reason the existing chain pattern works for narrative continuity.
 */
export async function timelapsePlanJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);
    if (!videoProject.idea) throw new Error("No prompt found on video project");

    await updateVideoStatus(videoProjectId, "PRODUCING");

    const config = videoProject.config ?? {};
    const duration = config.duration
      ? config.duration
      : resolveDuration({ preferred: 30 });
    const totalSeconds = duration.preferred;

    const supportedDurations = getModelDurationsArray(videoProject.modelSettings.videoModel);
    const videoModelId = videoProject.modelSettings.videoModel;
    const plannerModel = getAgentModels(videoProject.modelSettings, "cinematographerModel");

    console.log(`[timelapse-plan] Generating plan for ${videoProjectId} (target ${totalSeconds}s, ${videoModelId})`);

    const plan = await generateTimelapsePlan({
      prompt: videoProject.idea,
      style: videoProject.style,
      language: videoProject.language || "en",
      totalDurationSeconds: totalSeconds,
      model: plannerModel,
    });

    console.log(`[timelapse-plan] ${plan.processName} — ${plan.stages.length} stages: ${plan.stages.map((s) => s.stageDescription).join(" | ")}`);

    await mergeProjectConfig(videoProjectId, { duration, timelapsePlan: plan });

    // Replace any prior scenes/frames (idempotent re-runs).
    await db.delete(schema.videoScenes).where(eq(schema.videoScenes.videoProjectId, videoProjectId));

    // Insert one scene per stage; one frame per scene.
    for (let i = 0; i < plan.stages.length; i++) {
      const stage = plan.stages[i];
      const clipDuration = clampToSupportedDuration(stage.durationSeconds, supportedDurations);

      const sceneText = stage.voiceoverLine?.trim() || stage.stageDescription;

      const [scene] = await db
        .insert(schema.videoScenes)
        .values({
          videoProjectId,
          sceneOrder: i,
          sceneTitle: `Stage ${i + 1}: ${stage.stageDescription}`,
          directorNote: `[Timelapse stage ${i}] ${stage.stageDescription}`,
          text: sceneText,
          duration: clipDuration,
        })
        .returning();

      // Build a deterministic motion spec for this stage. The video-gen
      // worker reads `frame.visualDescription` as the i2v prompt and
      // `frame.motionSpec.endFramePolicy` to decide whether to anchor to the
      // next frame. Timelapse stages are HARD CUTS — interpolating between
      // two different stage states would morph the construction. So
      // endFramePolicy is always "freeform".
      const motionSpec: FrameMotionSpec = {
        primaryAction: stage.ambientMotion,
        cameraMove: "Locked. Static observational vantage held throughout the clip — no pan, no tilt, no zoom, no drift.",
        subjectDynamics: "Natural ambient motion fills the frame: dust, exhaust, water, sparks, workers in motion as appropriate to the stage. Background environmental anchors (skyline, distant buildings, trees) are still and unchanging.",
        endState: "Same locked vantage; ambient motion continues at steady tempo into the cut.",
        negativeMotion: "no camera movement, no zoom, no pan, no tilt, no parallax shift, no morphing of structures or environment, no transformation between stages within this clip",
        endFramePolicy: "freeform",
        endFramePolicyReason: "timelapse: each stage is a hard time-jump cut; anchoring to the next stage's image would morph construction state within this clip.",
      };

      const visualDescription = compileMotionPrompt(motionSpec, videoModelId);

      await db.insert(schema.sceneFrames).values({
        videoProjectId,
        sceneId: scene.id,
        frameOrder: 0,
        clipDuration,
        imagePrompt: stage.imagePrompt,
        motionSpec,
        visualDescription,
        transitionIn: i === 0 ? "fade" : "cut",
        sfxHint: null,
        assetRefs: null,
      });
    }

    console.log(`[timelapse-plan] Wrote ${plan.stages.length} scenes/frames for ${videoProjectId}`);

    // Generate per-stage narration (skipped automatically by generateTTS if
    // text is empty / whitespace, but our scenes always have text).
    await renderQueue.add("generate-tts", { videoProjectId });
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[timelapse-plan] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
