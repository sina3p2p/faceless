"use client";

import { useEffect } from "react";
import { OptionSelect } from "@/components/ui/option-select";
import {
  LLM_MODELS,
  DEFAULT_LLM_MODEL,
  IMAGE_MODELS,
  DEFAULT_VIDEO_MODEL,
  VIDEO_I2V_PROVIDER,
  videoModelsForProvider,
  VIDEO_TYPES,
  VIDEO_SIZES,
  DEFAULT_VIDEO_SIZE,
} from "@/lib/constants";
import type { AgentModels } from "@/types/worker-pipeline";

interface ModelSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export function VideoTypeSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <OptionSelect
      label="Video Type"
      value={value}
      onChange={onChange}
      options={VIDEO_TYPES.map((vt) => ({
        value: vt.id,
        label: vt.label,
        description: vt.description,
      }))}
    />
  );
}

export function LLMModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <OptionSelect
      label="AI Script Model"
      value={value}
      onChange={onChange}
      options={LLM_MODELS.map((m) => ({
        value: m.id,
        label: m.label,
        description: m.description,
        ...(m.id === DEFAULT_LLM_MODEL ? { badge: "RECOMMENDED" } : {}),
      }))}
    />
  );
}

export function ImageModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <OptionSelect
      label="Image Generation Model"
      value={value}
      onChange={onChange}
      options={IMAGE_MODELS.map((m) => ({
        value: m.id,
        label: m.label,
        description: m.description,
      }))}
    />
  );
}

export function VideoModelSelector({ value, onChange }: ModelSelectorProps) {
  const models = videoModelsForProvider(VIDEO_I2V_PROVIDER);
  const defaultId = models.find((m) => m.id === DEFAULT_VIDEO_MODEL)?.id ?? models[0]?.id ?? DEFAULT_VIDEO_MODEL;
  const coerced = models.some((m) => m.id === value) ? value : (models[0]?.id ?? value);

  useEffect(() => {
    const list = videoModelsForProvider(VIDEO_I2V_PROVIDER);
    if (list.length && !list.some((m) => m.id === value) && list[0]) {
      onChange(list[0].id);
    }
  }, [value, onChange]);

  return (
    <OptionSelect
      label="Video Generation Model"
      value={coerced}
      onChange={onChange}
      options={models.map((m) => ({
        value: m.id,
        label: m.label,
        description: m.description,
        ...(m.id === defaultId ? { badge: "RECOMMENDED" } : {}),
      }))}
    />
  );
}

export function VideoSizeSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Video Size
      </label>
      <div className="grid grid-cols-3 gap-3">
        {VIDEO_SIZES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`rounded-xl border p-3 text-center transition-all ${
              value === s.id
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <div className="flex justify-center mb-2">
              <div
                className={`border-2 rounded ${
                  value === s.id ? "border-violet-400" : "border-gray-500"
                }`}
                style={{
                  width: s.id === "9:16" ? 20 : s.id === "16:9" ? 36 : 24,
                  height: s.id === "9:16" ? 36 : s.id === "16:9" ? 20 : 24,
                }}
              />
            </div>
            <p className="font-medium text-white text-sm">{s.id}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{s.label.split("(")[0].trim()}</p>
            {s.id === DEFAULT_VIDEO_SIZE && (
              <span className="text-[9px] font-medium px-1 py-0.5 rounded bg-violet-500/20 text-violet-300 mt-1 inline-block">
                DEFAULT
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

const llmOptions = LLM_MODELS.map((m) => ({
  value: m.id,
  label: m.label,
  description: m.description,
  ...(m.id === DEFAULT_LLM_MODEL ? { badge: "RECOMMENDED" as const } : {}),
}));

const AGENT_LLM_GROUPS: {
  title: string;
  steps: { key: keyof AgentModels; label: string; blurb: string }[];
}[] = [
  {
    title: "Planning",
    steps: [
      { key: "producerModel", label: "Executive producer", blurb: "Creative brief, tone, and format plan" },
      { key: "storyModel", label: "Story", blurb: "Full script and title from your idea" },
    ],
  },
  {
    title: "Script & structure",
    steps: [
      { key: "directorModel", label: "Director", blurb: "Split story into timed scenes" },
      { key: "supervisorModel", label: "Script supervisor", blurb: "Continuity, names, and carry-over" },
    ],
  },
  {
    title: "Look & motion",
    steps: [
      { key: "cinematographerModel", label: "Cinematographer", blurb: "Visual style and lighting" },
      { key: "storyboardModel", label: "Storyboard", blurb: "Shots, framing, and pacing per scene" },
      { key: "promptModel", label: "Image prompts", blurb: "Text-to-image prompts for each frame" },
      { key: "motionModel", label: "Motion", blurb: "How each clip should move" },
    ],
  },
];

export type AgentLlmOverrides = Partial<Record<keyof AgentModels, string>>;

type AgentLlmModelSectionProps = {
  defaultModel: string;
  onDefaultModelChange: (v: string) => void;
  perStep: boolean;
  onPerStepChange: (v: boolean) => void;
  /** Keys omitted inherit `defaultModel`. */
  overrides: AgentLlmOverrides;
  onOverridesChange: (overrides: AgentLlmOverrides) => void;
};

/** Resolves a full `AgentModels` object for the API (used when per-step is on). */
export function buildAgentModelsBody(
  defaultModel: string,
  overrides: AgentLlmOverrides
): AgentModels {
  const keys: (keyof AgentModels)[] = [
    "producerModel",
    "storyModel",
    "directorModel",
    "supervisorModel",
    "cinematographerModel",
    "storyboardModel",
    "promptModel",
    "motionModel",
  ];
  const out = {} as AgentModels;
  for (const k of keys) {
    out[k] = overrides[k] ?? defaultModel;
  }
  return out;
}

/**
 * One default text model, or a labeled pick per pipeline role (director, story, motion, …).
 */
export function AgentLlmModelSection({
  defaultModel,
  onDefaultModelChange,
  perStep,
  onPerStepChange,
  overrides,
  onOverridesChange,
}: AgentLlmModelSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-200">Text / reasoning models</p>
        <p className="text-xs text-gray-500 mt-0.5">
          OpenRouter models for the pipeline. Use one for everything, or pick per step.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onPerStepChange(false)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            !perStep
              ? "bg-violet-500/20 border border-violet-500/50 text-violet-300"
              : "bg-white/5 border border-white/10 text-gray-400 hover:border-white/20"
          }`}
        >
          One model for all steps
        </button>
        <button
          type="button"
          onClick={() => onPerStepChange(true)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            perStep
              ? "bg-violet-500/20 border border-violet-500/50 text-violet-300"
              : "bg-white/5 border border-white/10 text-gray-400 hover:border-white/20"
          }`}
        >
          Pick per step
        </button>
      </div>

      <OptionSelect
        label={perStep ? "Default (fallback for all steps below)" : "Text model"}
        value={defaultModel}
        onChange={onDefaultModelChange}
        options={llmOptions}
      />

      {perStep && (
        <div className="space-y-5 rounded-xl border border-white/10 bg-white/2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-gray-400">Each step uses the model you choose, or the default above.</p>
            <button
              type="button"
              onClick={() => onOverridesChange({})}
              className="text-xs font-medium text-violet-400/90 hover:text-violet-300"
            >
              Inherit all from default
            </button>
          </div>

          {AGENT_LLM_GROUPS.map((group) => (
            <div key={group.title} className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{group.title}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.steps.map((step) => {
                  const value = overrides[step.key] ?? defaultModel;
                  return (
                    <div key={step.key} className="min-w-0">
                      <p className="text-[11px] text-gray-500 mb-1.5 leading-snug">{step.blurb}</p>
                      <OptionSelect
                        label={step.label}
                        triggerAriaLabel={`${step.label} model`}
                        value={value}
                        onChange={(v) =>
                          onOverridesChange({
                            ...overrides,
                            [step.key]: v === defaultModel ? undefined : v,
                          })
                        }
                        options={llmOptions}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <p className="text-xs text-gray-500 leading-relaxed -mt-1">
            Same order the pipeline runs: brief, script, scene split, continuity, look, storyboard, images, then motion.
          </p>
        </div>
      )}
    </div>
  );
}
