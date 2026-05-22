import { db, schema, eq } from "../shared";
import { VIDEO_MODELS, LLM } from "@/lib/constants";
import { type PipelineConfig } from "@/types/pipeline";
import type { ModelSettings } from "@/types/llm-common";
import type { AgentModels } from "@/types/worker-pipeline";

export const LLM_DEFAULT_BY_AGENT: Record<keyof AgentModels, string> = {
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
