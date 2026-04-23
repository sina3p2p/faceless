"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { VIDEO_MODELS } from "@/lib/constants";
import { useStudioContext } from "../../context/StudioContext";
import type { VideoNodeData } from "../scene-lab";

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  );
}


export function VideoNode({ data }: NodeProps) {
  const {
    frame,
    media,
    defaultVideoModel,
    generatingVideo,
    onUpdateMotion,
    onRegenerateVideo,
  } = data as VideoNodeData;

  const { selectedMedia, video } = useStudioContext();
  const isSelected = media && "id" in media && media.id
    ? selectedMedia?.mediaId === media.id
    : false;

  const [promptText, setPromptText] = useState(() => {
    if (media && "prompt" in media && media.prompt != null) return String(media.prompt);
    return frame.visualDescription ?? "";
  });

  const handleRegenerate = async () => {
    if (generatingVideo || !onRegenerateVideo) return;
    if (onUpdateMotion) {
      await onUpdateMotion(frame.id, promptText);
    }
    await onRegenerateVideo(frame.id, defaultVideoModel || undefined);
  };

  const aspectRatio = video.videoSize?.includes("9:16") ? "9:16" : "16:9";

  return (
    <>
      <div className={`w-72 rounded-2xl bg-white/3 overflow-hidden shadow-lg nopan nodrag nowheel transition-all ${isSelected
        ? "border-2 border-violet-500 ring-2 ring-violet-500/20"
        : "border border-white/10"
        }`}>
        {/* ── Image Section ── */}
        <div>
          {/* Image header */}
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <VideoIcon className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[12px] font-medium text-gray-300">Video</span>
            </div>
            <span className="text-[11px] text-gray-500">{VIDEO_MODELS.find(m => m.id === (frame.modelUsed))?.label || frame.modelUsed}</span>
          </div>

          {/* View preview */}
          <div className="px-3">
            {media && "url" in media && media.url ? (
              <div className="relative group rounded-xl overflow-hidden border border-white/5">
                <video src={media.url} className="w-full aspect-video object-cover" muted loop playsInline onMouseEnter={(e) => e.currentTarget.play()} onMouseLeave={(e) => e.currentTarget.pause()} />
                {generatingVideo && (
                  <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-10">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
                      <span className="text-[11px] text-violet-300 font-medium">Generating…</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-white/10 aspect-video flex flex-col items-center justify-center gap-2">
                {generatingVideo ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
                    <span className="text-[11px] text-violet-300 font-medium">Generating…</span>
                  </div>
                ) : (
                  <>
                    <VideoIcon className="w-6 h-6 text-gray-600" />
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
              rows={2}
              className="w-full bg-transparent text-[12px] text-gray-300 resize-none outline-none placeholder:text-gray-600"
              placeholder="Describe the motion (camera, movement)…"
            />
            <button
              type="button"
              onClick={() => { void handleRegenerate(); }}
              disabled={generatingVideo || !onRegenerateVideo}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white text-black text-[11px] font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              Re-generate
            </button>
          </div>

          {/* Image toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5">
            <span className="text-[10px] text-gray-600 font-mono">{aspectRatio}</span>
            {media && "url" in media && media?.url && (
              <>
                <div className="flex-1" />
                <a href={media.url} download target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors" title="Download video">
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
