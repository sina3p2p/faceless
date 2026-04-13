"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const MODEL_TAGS = ["Fast", "Cheap", "Quality", "Consistent"] as const;
type ModelTag = (typeof MODEL_TAGS)[number];

const MODEL_META: Record<string, { icon: string; color: string; tags: ModelTag[] }> = {
  "dall-e-3": { icon: "D", color: "bg-emerald-500", tags: ["Quality"] },
  "kling-image-v3": { icon: "K", color: "bg-blue-500", tags: ["Quality", "Consistent"] },
  "nano-banana-2": { icon: "G", color: "bg-violet-500", tags: ["Fast", "Consistent", "Quality"] },
};

export function ModelCommand({
  models,
  title,
  onSelect,
  onClose,
}: {
  models: readonly { id: string; label: string; description: string }[];
  title?: string;
  onSelect: (modelId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<ModelTag | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const filtered = models.filter(m => {
    const q = search.toLowerCase();
    if (q && !m.label.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q)) return false;
    if (activeTag && !MODEL_META[m.id]?.tags.includes(activeTag)) return false;
    return true;
  });

  useEffect(() => { setFocusedIndex(0); }, [search, activeTag]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIndex(i => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIndex(i => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && filtered[focusedIndex]) { onSelect(filtered[focusedIndex].id); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered, focusedIndex, onSelect, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-9999 flex items-start justify-center pt-[20vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-[440px] rounded-2xl bg-[#1a1a2e] border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="p-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={title || "Choose a model..."}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-[14px] text-white placeholder:text-gray-500 outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
          />
        </div>

        {/* Filter tags */}
        <div className="flex gap-1.5 px-4 pb-3">
          {MODEL_TAGS.map(tag => (
            <button
              key={tag}
              onClick={() => setActiveTag(t => t === tag ? null : tag)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${activeTag === tag
                ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                : "bg-white/5 text-gray-400 border border-white/5 hover:bg-white/10 hover:text-white"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Model list */}
        <div className="max-h-[320px] overflow-y-auto px-2 pb-2">
          {filtered.length === 0 && (
            <p className="text-[13px] text-gray-500 text-center py-6">No models found</p>
          )}
          {filtered.map((m, i) => {
            const meta = MODEL_META[m.id] || { icon: m.label[0], color: "bg-gray-500", tags: [] };
            const isFocused = i === focusedIndex;

            return (
              <button
                key={m.id}
                onClick={() => onSelect(m.id)}
                onMouseEnter={() => setFocusedIndex(i)}
                className={`w-full flex items-center gap-3.5 px-3 py-3 rounded-xl text-left transition-colors ${isFocused
                  ? "bg-violet-500/15"
                  : "hover:bg-white/5"
                }`}
              >
                <div className={`w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-[15px] font-bold">{meta.icon}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <span className={`text-[14px] font-semibold ${isFocused ? "text-white" : "text-gray-200"}`}>{m.label}</span>
                  <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5 line-clamp-1">{m.description}</p>
                </div>

                {isFocused && (
                  <kbd className="shrink-0 px-2 py-0.5 rounded-md bg-white/10 text-[10px] text-gray-400 font-mono border border-white/5">
                    ↵
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
