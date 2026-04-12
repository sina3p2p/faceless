"use client";

import { Button } from "@/components/ui/button";
import type { VideoDetail } from "../types";
import type { VideoPhase } from "../hooks/use-video-phase";

export function StudioTopBar({
  video,
  phase,
  totalDuration,
  scenesCount,
  onBack,
  onTogglePipelineMode,
}: {
  video: VideoDetail | null;
  phase: VideoPhase;
  totalDuration: number;
  scenesCount: number;
  onBack: () => void;
  onTogglePipelineMode: () => void;
}) {
  const currentPhase = phase.phases.find((p) => p.id === phase.activePhaseId);
  const imageModel = video?.series?.imageModel || "dall-e-3";
  const videoModel = video?.series?.videoModel || "—";

  return (
    <div className="h-12 border-b border-white/5 bg-black/40 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="text-gray-500 hover:text-white px-2 -ml-1"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </Button>

      {/* Title */}
      <div className="flex items-center gap-2 min-w-0">
        <h1 className="text-sm font-semibold text-white truncate">
          {video?.title || "Untitled Project"}
        </h1>
        {currentPhase && (
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0 ${
            currentPhase.status === "processing" ? "bg-violet-500/20 text-violet-400" :
            currentPhase.status === "review" ? "bg-amber-500/20 text-amber-400" :
            currentPhase.status === "done" ? "bg-emerald-500/20 text-emerald-400" :
            "bg-white/5 text-gray-500"
          }`}>
            {currentPhase.status === "processing" ? "Processing" :
             currentPhase.status === "review" ? "Review" :
             currentPhase.status === "done" ? "Complete" :
             currentPhase.label}
          </span>
        )}
      </div>

      {/* Status line */}
      {phase.isProcessing && phase.processingMessage && (
        <div className="flex items-center gap-2 text-[11px] text-violet-400 flex-1 min-w-0 justify-center">
          <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full shrink-0" />
          <span className="truncate">{phase.processingMessage}</span>
        </div>
      )}
      {!phase.isProcessing && <div className="flex-1" />}

      {/* Stats */}
      <div className="flex items-center gap-4 text-[11px] text-gray-500 shrink-0">
        <span>{scenesCount} scenes</span>
        {phase.hasTTSRun && <span className="font-mono">{totalDuration.toFixed(1)}s</span>}
        <span className="text-gray-600" title="Image model">{imageModel}</span>
        <span className="text-gray-600" title="Video model">{videoModel}</span>
      </div>

      {/* Pipeline mode toggle */}
      <div
        onClick={onTogglePipelineMode}
        className="flex items-center gap-1.5 cursor-pointer select-none shrink-0"
      >
        <div className={`w-7 h-4 rounded-full transition-colors flex items-center px-0.5 ${video?.config?.pipelineMode === "auto" ? "bg-violet-500" : "bg-white/10"}`}>
          <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${video?.config?.pipelineMode === "auto" ? "translate-x-3" : "translate-x-0"}`} />
        </div>
        <span className="text-[10px] text-gray-500">
          {video?.config?.pipelineMode === "auto" ? "Auto" : "Manual"}
        </span>
      </div>
    </div>
  );
}
