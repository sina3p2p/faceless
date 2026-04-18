"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { Scene, SceneFrame } from "@/types/video-detail";

export type BriefNodeData = {
  scene: Scene;
  frame: SceneFrame;
  frameIndex: number;
};

export function BriefNode({ data }: NodeProps) {
  const { scene, frame, frameIndex } = data as BriefNodeData;

  return (
    <>
      <div className="w-52 rounded-xl border border-white/10 bg-white/2 overflow-hidden nopan nodrag nowheel">
        <div className="px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-violet-500 font-semibold">Brief</span>
            <span className="text-[11px] font-semibold text-white">Frame {frameIndex + 1}</span>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {scene.speaker && (
            <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium uppercase">
              {scene.speaker}
            </span>
          )}
          <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-6">{scene.text}</p>
          {scene.audioUrl && (
            <audio src={scene.audioUrl} controls className="w-full h-7 [&::-webkit-media-controls-panel]:bg-white/5" />
          )}
          <div className="flex items-center gap-2 pt-1 border-t border-white/5">
            <span className="text-[10px] font-mono text-gray-600">{frame.clipDuration?.toFixed(1)}s</span>
          </div>
          {scene.directorNote && (
            <div className="pt-1 border-t border-white/5">
              <span className="text-[9px] uppercase tracking-wider text-amber-600 font-medium">Director</span>
              <p className="text-[9px] text-gray-500 leading-relaxed mt-0.5 line-clamp-3">{scene.directorNote}</p>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-2! h-2! bg-violet-500/50! border-0!" />
    </>
  );
}
