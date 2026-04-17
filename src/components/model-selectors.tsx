"use client";

import { OptionSelect } from "@/components/ui/option-select";
import {
  LLM_MODELS,
  DEFAULT_LLM_MODEL,
  IMAGE_MODELS,
  VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL,
  VIDEO_TYPES,
  VIDEO_SIZES,
  DEFAULT_VIDEO_SIZE,
} from "@/lib/constants";

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
  return (
    <OptionSelect
      label="Video Generation Model"
      value={value}
      onChange={onChange}
      options={VIDEO_MODELS.map((m) => ({
        value: m.id,
        label: m.label,
        description: m.description,
        ...(m.id === DEFAULT_VIDEO_MODEL ? { badge: "RECOMMENDED" } : {}),
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
