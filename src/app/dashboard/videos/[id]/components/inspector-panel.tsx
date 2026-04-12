"use client";

import type { VideoDetail } from "../types";
import type { VideoPhase } from "../hooks/use-video-phase";

export function InspectorPanel({
  video,
  phase,
}: {
  video: VideoDetail | null;
  phase: VideoPhase;
}) {
  const currentPhase = phase.phases.find((p) => p.id === phase.activePhaseId);

  return (
    <aside className="w-72 shrink-0 border-l border-white/5 bg-black/30 flex flex-col overflow-y-auto">
      {/* Persistent header */}
      <div className="px-4 py-3 border-b border-white/5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Project</span>
          {currentPhase && (
            <span className={`w-2 h-2 rounded-full ${
              currentPhase.status === "processing" ? "bg-violet-400 animate-pulse" :
              currentPhase.status === "review" ? "bg-amber-400" :
              currentPhase.status === "done" ? "bg-emerald-400" :
              "bg-gray-600"
            }`} />
          )}
        </div>

        {/* Model badges */}
        <div className="space-y-1.5">
          <InfoRow label="Image" value={video?.series?.imageModel || "dall-e-3"} />
          <InfoRow label="Video" value={video?.series?.videoModel || "—"} />
          <InfoRow label="Type" value={video?.series?.videoType || "standalone"} />
          <InfoRow label="Size" value={video?.series?.videoSize || "9:16"} />
        </div>
      </div>

      {/* Phase-contextual body */}
      <div className="flex-1 px-4 py-3">
        {phase.isProcessing && (
          <div className="space-y-3">
            <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Activity</span>
            <div className="flex items-center gap-2 text-xs text-violet-400">
              <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full shrink-0" />
              <span>{phase.processingMessage}</span>
            </div>
          </div>
        )}

        {!phase.isProcessing && (
          <div className="space-y-3">
            <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
              {currentPhase?.label || "Details"}
            </span>
            <p className="text-xs text-gray-500 leading-relaxed">
              {phase.headerDescription}
            </p>

            {/* Creative brief summary */}
            {video?.config?.creativeBrief && (
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Brief</span>
                <p className="text-xs text-gray-400 leading-relaxed">{video.config.creativeBrief.concept}</p>
                {video.config.creativeBrief.tone && (
                  <div className="flex gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-400">{video.config.creativeBrief.tone}</span>
                    {video.config.creativeBrief.visualMood && (
                      <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-400">{video.config.creativeBrief.visualMood}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Visual style summary */}
            {video?.config?.visualStyleGuide && (
              <div className="space-y-1.5 pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Visual Style</span>
                <InfoRow label="Medium" value={video.config.visualStyleGuide.global.medium} />
                <InfoRow label="Camera" value={video.config.visualStyleGuide.global.cameraPhysics} />
                <InfoRow label="Lighting" value={video.config.visualStyleGuide.global.defaultLighting} />
                {video.config.visualStyleGuide.global.colorPalette.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {video.config.visualStyleGuide.global.colorPalette.map((c, i) => (
                      <span key={i} className="w-4 h-4 rounded-sm border border-white/10" style={{ backgroundColor: c }} title={c} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Niche/series badge */}
      <div className="px-4 py-3 border-t border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600">{video?.series?.niche}</span>
          <span className="text-[10px] text-gray-700">·</span>
          <span className="text-[10px] text-gray-600 truncate">{video?.series?.name}</span>
        </div>
      </div>
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-600">{label}</span>
      <span className="text-[10px] text-gray-400 font-medium truncate ml-2 max-w-[140px]">{value}</span>
    </div>
  );
}
