"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { VIDEO_MODELS } from "@/lib/constants";
import type { Media, SceneFrame } from "../../../types";
import type { VideoPhase } from "../../../hooks/use-video-phase";
import { useStudioContext } from "../../context/StudioContext";

export type MotionNodeData = {
    frame: SceneFrame;
    media: Media;
    frameIndex: number;
    phase: VideoPhase;
    videoSize: string | null;
    generatingVideo: boolean;
    generatingMotion: boolean;
    onUpdateMotion: (frameId: string, motion: string) => void;
};

function VideoIcon({ className }: { className?: string }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
        </svg>
    );
}

export function MotionNode({ data }: NodeProps) {
    const {
        frame,
        media,
        videoSize,
        generatingVideo,
        generatingMotion,
        onUpdateMotion,
    } = data as MotionNodeData;

    const { selectedMedia } = useStudioContext();
    const isSelected = selectedMedia?.mediaId === media.id;

    const serverMotion = frame.visualDescription || "";
    const [draft, setDraft] = useState<string | null>(null);
    const motionText = draft !== null ? draft : serverMotion;

    const aspectRatio = videoSize?.includes("9:16") ? "9:16" : "16:9";

    return (
        <>
            <div className={`w-72 rounded-2xl bg-white/3 overflow-hidden shadow-lg nopan nodrag nowheel transition-all ${isSelected
                ? "border-2 border-violet-500 ring-2 ring-violet-500/20"
                : "border border-white/10"
                }`}>
                <div>
                    <div className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                            <VideoIcon className="w-3.5 h-3.5 text-emerald-400/80" />
                            <span className="text-[12px] font-medium text-gray-300">Motion → video</span>
                        </div>
                        <span className="text-[11px] text-gray-500">{VIDEO_MODELS.find(m => m.id === (media.modelUsed ?? frame.modelUsed))?.label || media.modelUsed || frame.modelUsed || "—"}</span>
                    </div>

                    <div className="px-3">
                        {/* REVIEW_MOTION: clips are not generated yet — always a preview slot */}
                        <div className="relative rounded-xl border-2 border-dashed border-white/10 aspect-video flex flex-col items-center justify-center gap-2 bg-black/20">
                            {generatingVideo ? (
                                <div className="flex items-center gap-2">
                                    <div className="animate-spin w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full" />
                                    <span className="text-[11px] text-violet-300 font-medium">Generating video…</span>
                                </div>
                            ) : (
                                <>
                                    <VideoIcon className="w-6 h-6 text-gray-600" />
                                    <span className="text-[11px] text-gray-500 text-center px-3 leading-snug">
                                        No clip yet — approve motion and generate video to fill this frame
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="px-4 py-3 space-y-1.5">
                        <span className="text-[10px] uppercase tracking-wide text-gray-600 font-medium">Motion prompt</span>
                        <textarea
                            value={motionText}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={() => {
                                const next = draft !== null ? draft : serverMotion;
                                setDraft(null);
                                if (next !== serverMotion) {
                                    onUpdateMotion(frame.id, next);
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                    setDraft(null);
                                }
                            }}
                            rows={3}
                            disabled={generatingMotion}
                            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-emerald-200/90 resize-none outline-none placeholder:text-gray-600 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-50"
                            placeholder="Describe camera movement, pacing, and action for this clip..."
                        />
                        {generatingMotion && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                                <div className="animate-spin w-3 h-3 border border-emerald-400 border-t-transparent rounded-full" />
                                Updating motion…
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3 px-4 py-2 border-t border-white/5">
                        <span className="text-[10px] text-gray-600 font-mono">{aspectRatio}</span>
                    </div>
                </div>
            </div>

            <Handle type="target" position={Position.Top} className="w-2! h-2! bg-violet-500/50! border-0!" />
            <Handle type="source" position={Position.Bottom} className="w-2! h-2! bg-violet-500/50! border-0!" />
        </>
    );
}
