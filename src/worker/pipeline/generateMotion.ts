import { Job } from "bullmq";
import { db, schema, eq, updateVideoStatus, failJob } from "../shared";
import type { RenderJobData } from "@/lib/queue";
import { WORKER } from "@/lib/constants";
import { generateSingleFrameMotion } from "@/server/services/llm";
import { withAiAuditContext } from "@/server/services/ai-audit";
import { mediaUrl } from "@/lib/storage";
import { getAgentModels, autoChainOrReview } from "./shared";
import { computeFrameWps } from "@/server/services/frame-tempo";
import type { WordTimestamp } from "@/types/tts";

export async function generateMotionJob(job: Job<RenderJobData>) {
  const { videoProjectId } = job.data;

  try {
    const videoProject = await db.query.videoProjects.findFirst({
      where: eq(schema.videoProjects.id, videoProjectId),
    });
    if (!videoProject) throw new Error(`Video project not found: ${videoProjectId}`);

    await updateVideoStatus(videoProjectId, "MOTION_GENERATION");

    const existingScenes = await db.query.videoScenes.findMany({
      where: eq(schema.videoScenes.videoProjectId, videoProjectId),
      orderBy: (vs, { asc }) => [asc(vs.sceneOrder)],
    });

    const rawFrames = await db.query.sceneFrames.findMany({
      where: eq(schema.sceneFrames.videoProjectId, videoProjectId),
      with: { imageMedia: true, scene: true },
    });


    if (rawFrames.length === 0) {
      throw new Error("No frames found");
    }

    const frames = [...rawFrames].sort((a, b) => {
      const sa = a.scene?.sceneOrder ?? 0;
      const sb = b.scene?.sceneOrder ?? 0;
      if (sa !== sb) return sa - sb;
      return a.frameOrder - b.frameOrder;
    });

    // Per-frame VO tempo: walk frames in (scene, frameOrder) order and
    // accumulate start times within each scene so we can slice the scene's
    // word-timestamps into a per-frame WPS.
    const frameStartByFrameId = new Map<string, number>();
    {
      let lastSceneId: string | null = null;
      let cursor = 0;
      for (const f of frames) {
        const sceneId = f.scene?.id ?? null;
        if (sceneId !== lastSceneId) {
          cursor = 0;
          lastSceneId = sceneId;
        }
        frameStartByFrameId.set(f.id, cursor);
        cursor += f.clipDuration ?? 5;
      }
    }

    const allFrameData = frames.map((frame) => {
      const captionData = (frame.scene?.captionData as WordTimestamp[] | null) ?? null;
      const frameStartS = frameStartByFrameId.get(frame.id) ?? 0;
      const clipDuration = frame.clipDuration ?? 5;
      const voTempoWps = computeFrameWps(captionData, frameStartS, clipDuration);
      return {
        frameId: frame.id,
        sceneId: frame.scene?.id ?? null,
        clipDuration,
        sceneText: frame.scene?.text ?? "",
        imageUrl: frame.imageMedia?.url ? mediaUrl(frame.imageMedia.url) : "",
        motionSkillHints: frame.motionSkillHints ?? null,
        assetRefs: frame.assetRefs,
        voTempoWps,
      };
    });

    const config = videoProject.config ?? {};
    const styleGuide = config.visualStyleGuide;
    const frameBreakdown = config.frameBreakdown;

    const cameraPhysics = styleGuide?.global?.cameraPhysics ?? "";
    const materialLanguage = styleGuide?.global?.materialLanguage ?? "";

    const framesToProcess = allFrameData;

    console.log(`[generate-motion] Generating motion for ${framesToProcess.length} frames across ${existingScenes.length} scenes`);

    const agents = getAgentModels(videoProject);
    const videoModelId = videoProject.modelSettings.videoModel;
    const BATCH_SIZE = WORKER.parallelImages;

    let globalFrameIdx = 0;
    const frameSpecMap: Map<number, { sceneIdx: number; frameIdx: number }> = new Map();
    for (let si = 0; si < existingScenes.length; si++) {
      const sceneFrameCount = (await db.query.sceneFrames.findMany({
        where: eq(schema.sceneFrames.sceneId, existingScenes[si].id),
      })).length;
      for (let fi = 0; fi < sceneFrameCount; fi++) {
        frameSpecMap.set(globalFrameIdx++, { sceneIdx: si, frameIdx: fi });
      }
    }

    for (let i = 0; i < framesToProcess.length; i += BATCH_SIZE) {
      const batch = framesToProcess.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (frameData, batchIdx) => {
          const globalIdx = i + batchIdx;
          const currentImageUrl = frameData.imageUrl;
          const nextImageUrl = globalIdx + 1 < allFrameData.length
            ? allFrameData[globalIdx + 1].imageUrl
            : null;

          if (!currentImageUrl) {
            console.warn(`[generate-motion] Frame ${frameData.frameId} has no image, skipping`);
            return;
          }

          const mapping = frameSpecMap.get(globalIdx);
          const frameSpec = mapping
            ? frameBreakdown?.scenes?.[mapping.sceneIdx]?.frames?.[mapping.frameIdx]
            : undefined;
          const fi = mapping?.frameIdx ?? 0;

          try {
            const result = await withAiAuditContext(
              { frameId: frameData.frameId, sceneId: frameData.sceneId ?? undefined },
              () =>
                generateSingleFrameMotion(
                  {
                    clipDuration: frameData.clipDuration,
                    motionPolicy: frameSpec?.motionPolicy ?? "moderate",
                    transitionIn: frameSpec?.transitionIn ?? "cut",
                    isLastFrame: globalIdx === allFrameData.length - 1,
                    sceneText: frameData.sceneText,
                    cameraPhysics,
                    materialLanguage,
                    skillHints: frameData.motionSkillHints,
                    narrativeIntent: frameSpec?.narrativeIntent,
                    assetRefCount: frameData.assetRefs?.length ?? 0,
                    isDefaultHookSlot: fi === 0,
                    voTempoWps: frameData.voTempoWps,
                  },
                  currentImageUrl,
                  nextImageUrl,
                  agents.motionModel,
                  videoModelId,
                ),
            );

            await db
              .update(schema.sceneFrames)
              .set({
                motionSpec: result.motionSpec,
                visualDescription: result.visualDescription,
              })
              .where(eq(schema.sceneFrames.id, frameData.frameId));

            console.log(`[generate-motion] Frame ${globalIdx + 1}/${framesToProcess.length} done`);
          } catch (err) {
            console.error(`[generate-motion] Frame ${frameData.frameId} failed:`, err instanceof Error ? err.message : err);
          }
        })
      );

      const progress = Math.round(((i + batch.length) / framesToProcess.length) * 100);
      await job.updateProgress(progress);
    }

    console.log(`[generate-motion] Motion descriptions ready`);

    await autoChainOrReview(videoProjectId, "REVIEW_MOTION", "generate-frame-videos");
  } catch (error) {
    const msg = await failJob(videoProjectId, error);
    console.error(`[generate-motion] Failed for ${videoProjectId}:`, msg);
    throw error;
  }
}
