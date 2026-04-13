"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { IMAGE_MODELS } from "@/lib/constants";
import type { Media, SceneFrame } from "../../../types";
import type { VideoPhase } from "../../../hooks/use-video-phase";
import { useStudioContext } from "../../context/StudioContext";

type ImageNodeData = {
  frame: SceneFrame;
  media: Media;
  frameIndex: number;
  phase: VideoPhase;
  defaultImageModel: string;
  generatingImage: boolean;
  generatingMotion: boolean;
  videoSize: string | null;
  onGenerateImage: (frameId: string, prompt?: string, model?: string) => void;
};

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21ZM16.5 7.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  );
}


export function ImageNode({ data }: NodeProps) {
  const {
    frame, media, frameIndex,
    defaultImageModel, videoSize,
    generatingImage,
    onGenerateImage,
  } = data as ImageNodeData;

  const { selectedMedia } = useStudioContext();
  const isSelected = selectedMedia?.mediaId === media.id;

  const [promptText, setPromptText] = useState(media.prompt || "");

  const aspectRatio = videoSize?.includes("9:16") ? "9:16" : "16:9";

  return (
    <>
      <div className={`w-72 rounded-2xl bg-white/3 overflow-hidden shadow-lg nopan nodrag nowheel transition-all ${isSelected
        ? "border-2 border-violet-500 ring-2 ring-violet-500/20"
        : "border border-white/10"
        } ${frame.imageMediaId !== media.id && "opacity-10"}
        }`}>
        {/* ── Image Section ── */}
        <div>
          {/* Image header */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[12px] font-medium text-gray-300">Image</span>
            </div>
            <span className="text-[11px] text-gray-500">{IMAGE_MODELS.find(m => m.id === (frame.modelUsed))?.label || frame.modelUsed}</span>
          </div>

          {/* Image preview */}
          <div className="px-3">
            {media.url ? (
              <div className="relative group rounded-xl overflow-hidden border border-white/5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media.url} alt={`Frame ${frameIndex + 1}`} className="w-full aspect-video object-cover" />
                {generatingImage && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
                      <span className="text-[11px] text-violet-300 font-medium">Generating...</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-white/10 aspect-video flex flex-col items-center justify-center gap-2">
                {generatingImage ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
                    <span className="text-[11px] text-violet-300 font-medium">Generating...</span>
                  </div>
                ) : (
                  <>
                    <ImageIcon className="w-6 h-6 text-gray-600" />
                    <span className="text-[11px] text-gray-500">Your generation will appear here</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Prompt + Run */}
          <div className="flex items-end justify-between gap-2 px-4 py-3">
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              // onBlur={() => { setEditingPrompt(false); if (promptText !== (frame.imagePrompt || "")) onUpdatePrompt(frame.id, promptText); }}
              // onKeyDown={(e) => {
              //   if (e.key === "Escape") { setPromptText(frame.imagePrompt || ""); setEditingPrompt(false); }
              //   if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); setEditingPrompt(false); if (promptText !== (frame.imagePrompt || "")) onUpdatePrompt(frame.id, promptText); }
              // }}
              rows={2}
              className="w-full bg-transparent text-[12px] text-gray-300 resize-none outline-none placeholder:text-gray-600"
              placeholder="Describe the image..."
            />
            <button
              onClick={() => onGenerateImage(frame.id, undefined, defaultImageModel)}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-semibold hover:bg-gray-200 transition-colors"
            >
              Re-generate
            </button>
          </div>

          {/* Image toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5">
            <span className="text-[10px] text-gray-600 font-mono">{aspectRatio}</span>
            {media.url && (
              <>
                <div className="flex-1" />
                <a href={media.url} download target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors" title="Download image">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                </a>
              </>
            )}
          </div>
        </div>
      </div>


      <Handle type="target" position={Position.Top} className="w-2! h-2! bg-violet-500/50! border-0!" />
      <Handle type="source" position={Position.Bottom} className="w-2! h-2! bg-violet-500/50! border-0!" />
    </>
  );
}
