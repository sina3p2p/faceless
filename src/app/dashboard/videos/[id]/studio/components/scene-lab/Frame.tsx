import { type VideoPhase } from "../../../hooks/use-video-phase";
import { type SceneFrame } from "../../../types";
import { useState, useEffect } from "react";

export default function Frame({
    frame,
    frameIndex,
    phase,
    defaultImageModel,
    defaultVideoModel,
    generatingImage,
    generatingVideo,
    generatingMotion,
    onGenerateImage,
    onUpdatePrompt,
    onUpdateMotion,
    onRegenerateVideo,
    onRegenerateMotion,
    onSelectVariant,
    onCompare,
}: {
    frame: SceneFrame;
    frameIndex: number;
    phase: VideoPhase;
    defaultImageModel: string;
    defaultVideoModel: string;
    generatingImage: boolean;
    generatingVideo: boolean;
    generatingMotion: boolean;
    onGenerateImage: (frameId: string, prompt?: string, model?: string) => void;
    onUpdatePrompt: (frameId: string, prompt: string) => void;
    onUpdateMotion: (frameId: string, motion: string) => void;
    onRegenerateVideo: (frameId: string, videoModel?: string) => void;
    onRegenerateMotion: (frameId: string) => void;
    onSelectVariant: (frameId: string, variantId: string, type: "image" | "video") => void;
    onCompare: (frame: SceneFrame, frameIndex: number, type: "image" | "video") => void;
}) {
    const [editingPrompt, setEditingPrompt] = useState(false);
    const [promptText, setPromptText] = useState(frame.imagePrompt || "");
    const [editingMotion, setEditingMotion] = useState(false);
    const [motionText, setMotionText] = useState(frame.visualDescription || "");
    const [showImageModelPicker, setShowImageModelPicker] = useState(false);
    const [showVideoModelPicker, setShowVideoModelPicker] = useState(false);

    // useEffect(() => { setPromptText(frame.imagePrompt || ""); }, [frame.imagePrompt]);
    // useEffect(() => { setMotionText(frame.visualDescription || ""); }, [frame.visualDescription]);

    const allMedia = frame.media ?? [];
    const imageVariants = allMedia.filter(m => m.type === "image");
    const videoVariants = allMedia.filter(m => m.type === "video");
    const hasImageVariants = imageVariants.length > 0;
    const hasVideoVariants = videoVariants.length > 0;

    const isVideoStale = !!(
        frame.videoUrl && frame.imageGeneratedAt && frame.videoGeneratedAt &&
        frame.imageGeneratedAt > frame.videoGeneratedAt
    );

    console.log(frame);

    return imageVariants.map(v => <div key={v.id} className="w-56 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-violet-500 font-medium">Frame {frameIndex + 1}</span>
            {frame.clipDuration && <span className="text-[10px] text-gray-600 font-mono">{frame.clipDuration}s</span>}
            {frame.modelUsed && <span className="text-[9px] text-gray-700 ml-auto">{frame.modelUsed}</span>}
            {generatingImage && <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full ml-auto" />}
        </div>

        <div className="p-3 space-y-2">
            {/* Image */}
            {frame.imageUrl ? (
                <div className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={frame.imageUrl} alt={`Frame ${frameIndex + 1}`} className="rounded-lg w-full max-h-40 object-cover" />
                    {phase.showFrameActions && !generatingImage && (
                        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => setShowImageModelPicker(true)}
                                className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors"
                            >
                                + Variant
                            </button>
                            {hasImageVariants && (
                                <button
                                    onClick={() => onCompare(frame, frameIndex, "image")}
                                    className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors"
                                >
                                    Compare
                                </button>
                            )}
                        </div>
                    )}
                </div>
            ) : !generatingImage && phase.showFrameActions ? (
                <button
                    onClick={() => setShowImageModelPicker(true)}
                    className="w-full py-4 rounded-lg border border-dashed border-white/10 text-[10px] text-gray-500 hover:text-violet-400 hover:border-violet-500/30 transition-colors"
                >
                    Generate Image
                </button>
            ) : generatingImage ? (
                <div className="w-full py-4 rounded-lg bg-white/[0.02] flex items-center justify-center gap-1.5">
                    <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full" />
                    <span className="text-[10px] text-violet-400">Generating...</span>
                </div>
            ) : null}

            {editingPrompt ? (
                <textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    onBlur={() => { setEditingPrompt(false); if (promptText !== (frame.imagePrompt || "")) onUpdatePrompt(frame.id, promptText); }}
                    onKeyDown={(e) => { if (e.key === "Escape") { setPromptText(frame.imagePrompt || ""); setEditingPrompt(false); } }}
                    autoFocus rows={2}
                    className="w-full bg-black/40 border border-violet-500/20 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
                />
            ) : frame.imagePrompt ? (
                <p className="text-[10px] text-gray-500 leading-relaxed cursor-text hover:text-gray-400 transition-colors line-clamp-2" onClick={() => setEditingPrompt(true)}>
                    {frame.imagePrompt}
                </p>
            ) : null}

            {/* Motion */}
            {(phase.showFrameMotion || frame.visualDescription) && (
                <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[9px] uppercase tracking-wider text-emerald-600 font-medium">Motion</span>
                        {isVideoStale && <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px] font-bold uppercase">Stale</span>}
                        {!generatingMotion && frame.imageUrl && (
                            <button onClick={() => onRegenerateMotion(frame.id)} className="text-[9px] text-emerald-500/60 hover:text-emerald-400 transition-colors ml-auto">Regen</button>
                        )}
                        {generatingMotion && (
                            <div className="inline-flex items-center gap-1 text-[9px] text-emerald-400 ml-auto">
                                <div className="animate-spin w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full" />
                            </div>
                        )}
                    </div>
                    {editingMotion ? (
                        <textarea
                            value={motionText}
                            onChange={(e) => setMotionText(e.target.value)}
                            onBlur={() => { setEditingMotion(false); if (motionText !== (frame.visualDescription || "")) onUpdateMotion(frame.id, motionText); }}
                            onKeyDown={(e) => { if (e.key === "Escape") { setMotionText(frame.visualDescription || ""); setEditingMotion(false); } }}
                            autoFocus rows={2}
                            className="w-full bg-black/40 border border-emerald-500/20 rounded-lg px-2 py-1.5 text-[10px] text-emerald-200 resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                        />
                    ) : (
                        <p className="text-[10px] text-emerald-400/70 cursor-text hover:text-emerald-300 transition-colors leading-relaxed line-clamp-2" onClick={() => setEditingMotion(true)}>
                            {frame.visualDescription || "Click to add motion..."}
                        </p>
                    )}
                </div>
            )}

            {/* Video */}
            {phase.showFrameVideo && frame.videoUrl && (
                <div>
                    <div className={`relative group ${isVideoStale ? "ring-1 ring-amber-500/40 rounded-lg" : ""}`}>
                        <video src={frame.videoUrl} className="rounded-lg w-full max-h-28 object-cover bg-black" muted loop playsInline
                            onMouseEnter={(e) => e.currentTarget.play()}
                            onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                        />
                        <div className={`absolute top-1 left-1 px-1 py-0.5 rounded text-white text-[8px] font-bold uppercase ${isVideoStale ? "bg-amber-500/80" : "bg-green-500/80"}`}>
                            {isVideoStale ? "Stale" : "Ready"}
                        </div>
                        {!generatingVideo && (
                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => setShowVideoModelPicker(true)} className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors">+ Video</button>
                                {hasVideoVariants && (
                                    <button onClick={() => onCompare(frame, frameIndex, "video")} className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors">Compare</button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {phase.showFrameVideo && !frame.videoUrl && frame.imageUrl && !generatingVideo && (
                <button onClick={() => setShowVideoModelPicker(true)} className="w-full py-2 rounded-lg border border-dashed border-white/10 text-[10px] text-gray-500 hover:text-violet-400 hover:border-violet-500/30 transition-colors">
                    Generate Video
                </button>
            )}

            {/* Video model selector */}
            {/* {showVideoModelPicker && (
                        <ModelSelector
                            type="video"
                            defaultModel={defaultVideoModel}
                            onGenerate={(model) => { onRegenerateVideo(frame.id, model); setShowVideoModelPicker(false); }}
                            onCancel={() => setShowVideoModelPicker(false)}
                        />
                    )} */}

            {generatingVideo && (
                <div className="flex items-center gap-1.5 text-[9px] text-amber-400">
                    <div className="animate-spin w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full" />
                    Generating video...
                </div>
            )}
        </div>
    </div>)


}