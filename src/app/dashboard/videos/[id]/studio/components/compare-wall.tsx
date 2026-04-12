"use client";

import { useEffect } from "react";
import type { SceneFrame } from "../../types";

interface CompareItem {
  id: string;
  url: string;
  prompt: string | null;
  modelUsed: string | null;
  createdAt: string | null;
  isActive: boolean;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function CompareWall({
  frame,
  frameIndex,
  type,
  onSelect,
  onRegenerate,
  onClose,
}: {
  frame: SceneFrame;
  frameIndex: number;
  type: "image" | "video";
  onSelect: (frameId: string, variantId: string, type: "image" | "video") => void;
  onRegenerate: (frameId: string) => void;
  onClose: () => void;
}) {
  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Build unified list: active + variants
  const activeUrl = type === "image" ? frame.imageUrl : frame.videoUrl;
  const variants = type === "image" ? (frame.imageVariants ?? []) : (frame.videoVariants ?? []);
  const generatedAt = type === "image" ? frame.imageGeneratedAt : frame.videoGeneratedAt;

  if (!activeUrl) return null;

  const items: CompareItem[] = [
    {
      id: "current",
      url: activeUrl,
      prompt: type === "image" ? frame.imagePrompt : frame.visualDescription,
      modelUsed: frame.modelUsed ?? null,
      createdAt: generatedAt ?? null,
      isActive: true,
    },
    ...variants.map((v) => ({
      id: v.id,
      url: v.url,
      prompt: v.prompt,
      modelUsed: v.modelUsed,
      createdAt: v.createdAt,
      isActive: false,
    })),
  ];

  return (
    <div
      className="absolute inset-0 z-20 bg-black/85 backdrop-blur-md flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold">Compare</span>
          <span className="text-[10px] text-gray-600">·</span>
          <span className="text-[11px] text-gray-400">Frame {frameIndex + 1}</span>
          <span className="text-[10px] text-gray-600">·</span>
          <span className="text-[11px] text-gray-400 capitalize">{type}s</span>
          <span className="px-1.5 py-0.5 rounded-full bg-white/5 text-[10px] text-gray-500 font-medium">
            {items.length} takes
          </span>
        </div>

        <div className="w-8" /> {/* spacer for centering */}
      </div>

      {/* Monitor Grid */}
      <div className="flex-1 overflow-auto flex items-center justify-center px-6 pb-4">
        <div className="flex gap-4 items-start max-w-full overflow-x-auto scrollbar-none py-4">
          {items.map((item) => (
            <div
              key={item.id}
              className={`shrink-0 w-56 rounded-xl overflow-hidden border transition-all ${
                item.isActive
                  ? "border-violet-500 ring-1 ring-violet-500/30"
                  : "border-white/10 hover:border-white/20"
              }`}
            >
              {/* Preview */}
              <div className="relative bg-black/60 aspect-[9/16]">
                {type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <video
                    src={item.url}
                    className="w-full h-full object-cover"
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                  />
                )}

                {/* Active badge */}
                {item.isActive && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-violet-500 text-white text-[9px] font-bold uppercase flex items-center gap-1">
                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Active
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-3 space-y-2 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-white">
                    {item.modelUsed || "Unknown model"}
                  </span>
                  {item.createdAt && (
                    <span className="text-[10px] text-gray-600">{timeAgo(item.createdAt)}</span>
                  )}
                </div>

                {item.prompt && (
                  <p className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{item.prompt}</p>
                )}

                {item.isActive ? (
                  <div className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-center text-[10px] text-violet-400 font-medium">
                    Current Selection
                  </div>
                ) : (
                  <button
                    onClick={() => onSelect(frame.id, item.id, type)}
                    className="w-full px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] text-white font-medium hover:bg-violet-600 hover:border-violet-500 transition-colors"
                  >
                    Use This
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex justify-center pb-6 shrink-0">
        <button
          onClick={() => { onRegenerate(frame.id); onClose(); }}
          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300 font-medium hover:bg-white/10 hover:text-white transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Generate New Variant
        </button>
      </div>
    </div>
  );
}
