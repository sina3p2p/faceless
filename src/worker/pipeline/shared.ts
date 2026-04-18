import { db, schema, eq, updateVideoStatus } from "../shared";
import { renderQueue } from "@/lib/queue";
import { VIDEO_MODELS, DEFAULT_VIDEO_MODEL } from "@/lib/constants";
import { type PipelineConfig } from "@/types/pipeline";
import type { AgentModels } from "@/types/worker-pipeline";

function getPipelineMode(config: unknown): "manual" | "auto" {
  if (config && typeof config === "object" && "pipelineMode" in config) {
    return (config as Record<string, unknown>).pipelineMode === "auto" ? "auto" : "manual";
  }
  return "manual";
}

export function getModelDurationsArray(videoModel?: string | null): number[] {
  const entry = VIDEO_MODELS.find((m) => m.id === (videoModel || DEFAULT_VIDEO_MODEL));
  return (entry?.durations as number[]) ?? [5, 10];
}

export function getAgentModels(seriesRecord: { llmModel?: string | null }): AgentModels {
  const override = seriesRecord.llmModel || undefined;
  return {
    producerModel: override,
    storyModel: override,
    directorModel: override,
    supervisorModel: override,
    cinematographerModel: override,
    storyboardModel: override,
    promptModel: override,
    motionModel: override,
  };
}

export function getProjectConfig(config: unknown): PipelineConfig {
  if (config && typeof config === "object") return config as PipelineConfig;
  return {};
}

export async function loadProjectConfig(videoProjectId: string): Promise<PipelineConfig> {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { config: true },
  });
  return getProjectConfig(project?.config);
}

export async function mergeProjectConfig(videoProjectId: string, patch: Partial<PipelineConfig>) {
  const existing = await loadProjectConfig(videoProjectId);
  await db
    .update(schema.videoProjects)
    .set({ config: { ...existing, ...patch } })
    .where(eq(schema.videoProjects.id, videoProjectId));
}

export async function autoChainOrReview(
  videoProjectId: string,
  userId: string,
  reviewStatus: (typeof schema.videoStatusEnum.enumValues)[number],
  nextJobName: string
) {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { config: true },
  });
  const mode = getPipelineMode(project?.config);

  if (mode === "auto") {
    await renderQueue.add(nextJobName, { videoProjectId, userId });
  } else {
    await updateVideoStatus(videoProjectId, reviewStatus);
  }
}
