"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Scene } from "../../types";

function SceneStatus({ scene, isGenerating }: { scene: Scene; isGenerating: boolean }) {
  if (isGenerating) {
    return (
      <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-violet-500/20 text-violet-400 flex items-center gap-1">
        <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
        Gen
      </span>
    );
  }
  const hasVideo = scene.frames?.some((f) => f.videoUrl);
  const hasImage = scene.assetUrl || scene.frames?.some((f) => f.imageUrl);
  const hasAudio = !!scene.audioUrl;

  if (hasVideo) return <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400">Video</span>;
  if (hasImage) return <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400">Image</span>;
  if (hasAudio) return <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400">Audio</span>;
  return <span className="px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-white/5 text-gray-600">Pending</span>;
}

export function SceneBlock({
  scene,
  index,
  isSelected,
  videoSize,
  isGenerating,
  onSelect,
  onDoubleClick,
}: {
  scene: Scene;
  index: number;
  isSelected: boolean;
  videoSize: string;
  isGenerating: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Size based on video aspect ratio
  const sizeClass = videoSize === "16:9" ? "w-60" : videoSize === "1:1" ? "w-48" : "w-40";
  const aspectClass = videoSize === "16:9" ? "aspect-video" : videoSize === "1:1" ? "aspect-square" : "aspect-[9/16]";

  // Get thumbnail from first frame or scene asset
  const thumbnailUrl = scene.frames?.[0]?.imageUrl || scene.assetUrl;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      className={`${sizeClass} shrink-0 rounded-xl border transition-all cursor-pointer select-none ${
        isSelected
          ? "border-violet-500 ring-1 ring-violet-500/30 glow"
          : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
      }`}
    >
      {/* Thumbnail area */}
      <div className={`${aspectClass} bg-black/60 rounded-t-xl overflow-hidden relative`}>
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="absolute top-1.5 left-1.5 z-10 p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-black/40 cursor-grab transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="4" cy="3" r="1.5" /><circle cx="4" cy="8" r="1.5" /><circle cx="4" cy="13" r="1.5" />
            <circle cx="11" cy="3" r="1.5" /><circle cx="11" cy="8" r="1.5" /><circle cx="11" cy="13" r="1.5" />
          </svg>
        </div>

        {/* Status badge */}
        <div className="absolute top-1.5 right-1.5 z-10">
          <SceneStatus scene={scene} isGenerating={isGenerating} />
        </div>

        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-2xl font-bold text-white/[0.06]">{index + 1}</span>
          </div>
        )}

        {/* Generating overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="animate-spin w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="p-2.5 space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-semibold text-white">Scene {index + 1}</span>
          {scene.speaker && (
            <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium uppercase truncate max-w-[60px]">
              {scene.speaker}
            </span>
          )}
        </div>

        {scene.sceneTitle && (
          <p className="text-[10px] text-gray-300 font-medium truncate">{scene.sceneTitle}</p>
        )}

        <p className="text-[9px] text-gray-500 line-clamp-2 leading-relaxed">{scene.text}</p>

        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <span className="text-[10px] font-mono text-gray-600">{scene.duration?.toFixed(1)}s</span>
          {scene.frames && scene.frames.length > 0 && (
            <span className="text-[9px] text-gray-700">{scene.frames.length} frames</span>
          )}
        </div>
      </div>
    </div>
  );
}
