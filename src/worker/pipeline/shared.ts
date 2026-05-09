import { db, schema, eq, updateVideoStatus } from "../shared";
import { renderQueue } from "@/lib/queue";
import { VIDEO_MODELS, LLM } from "@/lib/constants";
import { type PipelineConfig } from "@/types/pipeline";
import type { ModelSettings } from "@/types/llm-common";
import type { AgentModels } from "@/types/worker-pipeline";

const LLM_DEFAULT_BY_AGENT: Record<keyof AgentModels, string> = {
  producerModel: LLM.producerModel,
  storyModel: LLM.storyModel,
  directorModel: LLM.directorModel,
  supervisorModel: LLM.supervisorModel,
  cinematographerModel: LLM.cinematographerModel,
  researchModel: LLM.researchModel,
  storyboardModel: LLM.storyboardModel,
  promptModel: LLM.promptModel,
  motionModel: LLM.motionModel,
  reviewerModel: LLM.reviewerModel,
};

const AGENT_MODEL_KEYS: (keyof AgentModels)[] = [
  "producerModel",
  "storyModel",
  "directorModel",
  "supervisorModel",
  "cinematographerModel",
  "researchModel",
  "storyboardModel",
  "promptModel",
  "motionModel",
  "reviewerModel",
];

function getPipelineMode(config: unknown): "manual" | "auto" {
  if (config && typeof config === "object" && "pipelineMode" in config) {
    return (config as Record<string, unknown>).pipelineMode === "auto" ? "auto" : "manual";
  }
  return "manual";
}

export function getModelDurationsArray(videoModel: TVideoModelId): number[] {
  return VIDEO_MODELS[videoModel].durations;
}

export function getAgentModels(
  modelSettings: ModelSettings,
  key: keyof AgentModels
): string {
  const fromMs = modelSettings[key as keyof ModelSettings] as string | undefined;
  return fromMs || LLM_DEFAULT_BY_AGENT[key];
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
  return project?.config ?? {}
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
  reviewStatus: (typeof schema.videoStatusEnum.enumValues)[number],
  nextJobName: string
) {
  const project = await db.query.videoProjects.findFirst({
    where: eq(schema.videoProjects.id, videoProjectId),
    columns: { config: true },
  });
  const mode = getPipelineMode(project?.config);

  if (mode === "auto") {
    await renderQueue.add(nextJobName, { videoProjectId });
  } else {
    await updateVideoStatus(videoProjectId, reviewStatus);
  }
}
