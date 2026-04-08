"use client";

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
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Video Type
      </label>
      <div className="grid grid-cols-2 gap-3">
        {VIDEO_TYPES.map((vt) => (
          <button
            key={vt.id}
            type="button"
            onClick={() => onChange(vt.id)}
            className={`rounded-xl border p-4 text-left transition-all ${
              value === vt.id
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <p className="font-medium text-white">{vt.label}</p>
            <p className="text-xs text-gray-400 mt-1">{vt.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function LLMModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        AI Script Model
      </label>
      <div className="space-y-2">
        {LLM_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              value === m.id
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-white text-sm">{m.label}</p>
              {m.id === DEFAULT_LLM_MODEL && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  RECOMMENDED
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ImageModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Image Generation Model
      </label>
      <div className="grid grid-cols-2 gap-3">
        {IMAGE_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`rounded-xl border p-3 text-left transition-all ${
              value === m.id
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <p className="font-medium text-white text-sm">{m.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function VideoModelSelector({ value, onChange }: ModelSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-2">
        Video Generation Model
      </label>
      <div className="space-y-2">
        {VIDEO_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`w-full rounded-xl border p-3 text-left transition-all ${
              value === m.id
                ? "border-violet-500 bg-violet-500/10 ring-1 ring-violet-500"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-white text-sm">{m.label}</p>
              {m.id === DEFAULT_VIDEO_MODEL && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
                  RECOMMENDED
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
          </button>
        ))}
      </div>
    </div>
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
