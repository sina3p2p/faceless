"use client";

import { useState } from "react";
import type { StoryAssetItem } from "@/types/video-detail";

const TYPE_COLORS: Record<string, string> = {
  character: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  location: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  prop: "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

export function AssetRefPills({
  assetRefs,
  allAssets,
  onToggle,
}: {
  assetRefs: string[];
  allAssets: StoryAssetItem[];
  onToggle: (refs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (allAssets.length === 0) return null;

  const refSet = new Set(assetRefs.map((r) => r.toLowerCase()));

  return (
    <div className="relative mb-2">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium mr-1">Assets</span>
        {assetRefs.map((ref) => {
          const asset = allAssets.find((a) => a.name.toLowerCase() === ref.toLowerCase());
          const color = asset ? TYPE_COLORS[asset.type] || "" : "bg-white/10 text-gray-400 border-white/10";
          return (
            <span key={ref} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${color}`}>
              {ref}
            </span>
          );
        })}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/5 border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-colors"
        >
          {assetRefs.length === 0 ? "+ Assign" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-64 bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-white/5">
            Toggle scene assets
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {allAssets.map((asset) => {
              const active = refSet.has(asset.name.toLowerCase());
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newRefs = active
                      ? assetRefs.filter((r) => r.toLowerCase() !== asset.name.toLowerCase())
                      : [...assetRefs, asset.name];
                    onToggle(newRefs);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${active ? "bg-violet-500/10" : "hover:bg-white/5"}`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${active ? "bg-violet-500 border-violet-500 text-white" : "border-white/20"}`}>
                    {active && "✓"}
                  </div>
                  <span className={`text-[9px] uppercase font-bold tracking-wider ${asset.type === "character" ? "text-violet-400" : asset.type === "location" ? "text-blue-400" : "text-amber-400"}`}>
                    {asset.type.slice(0, 4)}
                  </span>
                  <span className="text-xs text-gray-300 truncate">{asset.name}</span>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-white/5">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
