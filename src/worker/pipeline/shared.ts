import { db, schema, eq } from "../shared";
import { VIDEO_MODELS, LLM, MODEL_SETTINGS } from "@/lib/constants";
import { type PipelineConfig } from "@/types/pipeline";
import type { ModelSettings } from "@/types/llm-common";
import type { AgentModels } from "@/types/worker-pipeline";

export function getModelDurationsArray(videoModel: TVideoModelId): number[] {
  return VIDEO_MODELS[videoModel].durations;
}

export function getAgentModels(
  modelSettings: ModelSettings,
  key: keyof ModelSettings
): string {
  const fromMs = modelSettings[key] as string | undefined;
  return fromMs || MODEL_SETTINGS[key];
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
