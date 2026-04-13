"use client";

import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

const MODEL_TAGS = ["Fast", "Cheap", "Quality", "Consistent"] as const;

type ModelTag = (typeof MODEL_TAGS)[number];

const MODEL_META: Record<string, { icon: string; color: string; tags: ModelTag[] }> = {
  "dall-e-3": { icon: "D", color: "bg-emerald-500", tags: ["Quality"] },
  "kling-image-v3": { icon: "K", color: "bg-blue-500", tags: ["Quality", "Consistent"] },
  "nano-banana-2": { icon: "G", color: "bg-violet-500", tags: ["Fast", "Consistent", "Quality"] },
};

export function ModelPicker({
  models,
  selectedId,
  onSelect,
}: {
  models: readonly { id: string; label: string; description: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<ModelTag | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
    setActiveTag(null);
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({ top: rect.top, left: rect.left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    // Close on any pointer activity on the canvas (pan, zoom, drag)
    function onPointerOnCanvas(e: PointerEvent) {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      close();
    }

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    // Capture-phase pointerdown catches React Flow pan/zoom starts
    document.addEventListener("pointerdown", onPointerOnCanvas, true);
    // Close on any scroll anywhere (canvas transform, page scroll, etc.)
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    // Also close on wheel (React Flow zoom)
    window.addEventListener("wheel", close, true);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerOnCanvas, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close, true);
    };
  }, [open, close]);

  const current = models.find(m => m.id === selectedId);

  const filtered = models.filter(m => {
    const q = search.toLowerCase();
    if (q && !m.label.toLowerCase().includes(q) && !m.description.toLowerCase().includes(q)) return false;
    if (activeTag && !MODEL_META[m.id]?.tags.includes(activeTag)) return false;
    return true;
  });

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 text-[11px] text-gray-300 hover:text-white transition-colors"
      >
        <span className="truncate max-w-28">{current?.label || selectedId}</span>
        <svg className={`w-3 h-3 text-gray-500 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          className="fixed w-80 rounded-2xl bg-white shadow-2xl overflow-hidden border border-gray-200 animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{
            top: pos.top - 8,
            left: pos.left,
            transform: "translateY(-100%)",
            zIndex: 9999,
          }}
        >
          {/* Search */}
          <div className="p-3 pb-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all models..."
              autoFocus
              className="w-full px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-[13px] text-gray-900 placeholder:text-gray-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400/30"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {/* Filter tags */}
          <div className="flex gap-1.5 px-3 pb-2.5">
            {MODEL_TAGS.map(tag => (
              <button
                key={tag}
                onClick={(e) => { e.stopPropagation(); setActiveTag(t => t === tag ? null : tag); }}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${activeTag === tag
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>

          {/* Model list */}
          <div className="max-h-64 overflow-y-auto px-1.5 pb-1.5">
            {filtered.length === 0 && (
              <p className="text-[12px] text-gray-400 text-center py-4">No models found</p>
            )}
            {filtered.map(m => {
              const meta = MODEL_META[m.id] || { icon: m.label[0], color: "bg-gray-400", tags: [] };
              const isSelected = m.id === selectedId;

              return (
                <button
                  key={m.id}
                  onClick={(e) => { e.stopPropagation(); onSelect(m.id); setOpen(false); setSearch(""); setActiveTag(null); }}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isSelected
                    ? "bg-violet-50"
                    : "hover:bg-gray-50"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center shrink-0 mt-0.5`}>
                    <span className="text-white text-[14px] font-bold">{meta.icon}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-semibold ${isSelected ? "text-violet-700" : "text-gray-900"}`}>{m.label}</span>
                      {isSelected && (
                        <svg className="w-4 h-4 text-violet-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 leading-relaxed mt-0.5 line-clamp-1">{m.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
