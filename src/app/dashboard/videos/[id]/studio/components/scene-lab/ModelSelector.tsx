"use client";

import { useState } from "react";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/constants";

export function ModelSelector({
  type,
  defaultModel,
  onGenerate,
  onCancel,
}: {
  type: "image" | "video";
  defaultModel: string;
  onGenerate: (model: string) => void;
  onCancel: () => void;
}) {
  const models = type === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const [selected, setSelected] = useState(defaultModel || models[0]?.id || "");

  return (
    <div className="mt-1.5 rounded-lg bg-black/60 border border-white/10 p-2 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelected(m.id); }}
            className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${selected === m.id
              ? "bg-violet-600 text-white"
              : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
            title={m.description}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(selected); }}
          className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[9px] font-medium hover:bg-violet-500 transition-colors"
        >
          Generate
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          className="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 text-[9px] font-medium hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
