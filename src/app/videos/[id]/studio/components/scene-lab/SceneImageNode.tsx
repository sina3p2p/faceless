"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

export type SceneImageNodeData = {
  assetUrl: string;
  imagePrompt?: string | null;
};

export function SceneImageNode({ data }: NodeProps) {
  const { assetUrl, imagePrompt } = data as SceneImageNodeData;

  return (
    <>
      <Handle type="target" position={Position.Left} className="w-2! h-2! bg-violet-500/50! border-0!" />
      <div className="w-56 rounded-xl border border-white/10 bg-white/2 overflow-hidden">
        <div className="px-3 py-2 border-b border-white/5">
          <span className="text-[10px] uppercase tracking-wider text-cyan-500 font-medium">Scene Image</span>
        </div>
        <div className="p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl} alt="" className="rounded-lg w-full object-cover" />
          {imagePrompt && (
            <p className="text-[10px] text-gray-500 mt-2 line-clamp-3 leading-relaxed">{imagePrompt}</p>
          )}
        </div>
      </div>
    </>
  );
}
