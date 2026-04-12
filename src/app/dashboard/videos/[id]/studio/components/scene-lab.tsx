"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { Scene, SceneFrame, FrameVariant, VideoDetail } from "../../types";
import type { VideoPhase } from "../../hooks/use-video-phase";
import { useCanvasTransform } from "../hooks/use-canvas-transform";
import { ZoomControls } from "./zoom-controls";

// ── Variant thumbnail strip (reused pattern from frame-card.tsx) ──

function VariantStrip({
  variants,
  currentUrl,
  type,
  frameId,
  onSelect,
}: {
  variants: FrameVariant[];
  currentUrl: string;
  type: "image" | "video";
  frameId: string;
  onSelect: (frameId: string, variantId: string, type: "image" | "video") => void;
}) {
  return (
    <div className="flex gap-1 mt-1.5 overflow-x-auto pb-1">
      {/* Current (active) */}
      <div className="relative shrink-0 rounded border-2 border-violet-500 ring-1 ring-violet-500/30 overflow-hidden">
        {type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="Current" className="w-10 h-10 object-cover" />
        ) : (
          <video src={currentUrl} className="w-10 h-10 object-cover" muted />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-violet-500/20">
          <svg className="w-3 h-3 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      {variants.map((v) => (
        <button
          key={v.id}
          onClick={(e) => { e.stopPropagation(); onSelect(frameId, v.id, type); }}
          className="relative shrink-0 rounded border-2 border-white/10 overflow-hidden opacity-60 hover:opacity-100 hover:border-white/30 transition-all group/variant"
          title={`${v.modelUsed || "Unknown"} — Click to use`}
        >
          {type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.url} alt="" className="w-10 h-10 object-cover" />
          ) : (
            <video src={v.url} className="w-10 h-10 object-cover" muted />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/variant:opacity-100 transition-opacity">
            <span className="text-[8px] text-white font-semibold">Use</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Scene Brief Card ──

function SceneBrief({ scene, sceneIndex }: { scene: Scene; sceneIndex: number }) {
  return (
    <div className="w-52 shrink-0 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      <div className="px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-violet-500 font-semibold">Brief</span>
          <span className="text-[11px] font-semibold text-white">Scene {sceneIndex + 1}</span>
        </div>
        {scene.sceneTitle && (
          <p className="text-[11px] text-gray-300 font-medium mt-0.5 truncate">{scene.sceneTitle}</p>
        )}
      </div>

      <div className="p-3 space-y-2">
        {/* Speaker */}
        {scene.speaker && (
          <span className="inline-block text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-400 font-medium uppercase">
            {scene.speaker}
          </span>
        )}

        {/* Narration */}
        <p className="text-[10px] text-gray-400 leading-relaxed line-clamp-6">{scene.text}</p>

        {/* Audio player */}
        {scene.audioUrl && (
          <audio src={scene.audioUrl} controls className="w-full h-7 [&::-webkit-media-controls-panel]:bg-white/5" />
        )}

        {/* Duration */}
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <span className="text-[10px] font-mono text-gray-600">{scene.duration?.toFixed(1)}s</span>
          {scene.frames && scene.frames.length > 0 && (
            <span className="text-[9px] text-gray-700">{scene.frames.length} frames</span>
          )}
        </div>

        {/* Director's note */}
        {scene.directorNote && (
          <div className="pt-1 border-t border-white/5">
            <span className="text-[9px] uppercase tracking-wider text-amber-600 font-medium">Director</span>
            <p className="text-[9px] text-gray-500 leading-relaxed mt-0.5 line-clamp-3">{scene.directorNote}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Frame Node Card ──

function FrameNode({
  frame,
  frameIndex,
  phase,
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
  generatingImage: boolean;
  generatingVideo: boolean;
  generatingMotion: boolean;
  onGenerateImage: (frameId: string, prompt?: string) => void;
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

  useEffect(() => { setPromptText(frame.imagePrompt || ""); }, [frame.imagePrompt]);
  useEffect(() => { setMotionText(frame.visualDescription || ""); }, [frame.visualDescription]);

  const imageVariants = frame.imageVariants ?? [];
  const videoVariants = frame.videoVariants ?? [];

  const isVideoStale = !!(
    frame.videoUrl && frame.imageGeneratedAt && frame.videoGeneratedAt &&
    frame.imageGeneratedAt > frame.videoGeneratedAt
  );

  return (
    <div className="w-56 shrink-0 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-violet-500 font-medium">Frame {frameIndex + 1}</span>
        {frame.clipDuration && (
          <span className="text-[10px] text-gray-600 font-mono">{frame.clipDuration}s</span>
        )}
        {frame.modelUsed && (
          <span className="text-[9px] text-gray-700 ml-auto">{frame.modelUsed}</span>
        )}
        {generatingImage && (
          <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full ml-auto" />
        )}
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
                  onClick={() => onGenerateImage(frame.id)}
                  className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors"
                >
                  + Variant
                </button>
                {imageVariants.length > 0 && (
                  <button
                    onClick={() => onCompare(frame, frameIndex, "image")}
                    className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors"
                  >
                    Compare
                  </button>
                )}
              </div>
            )}
            {imageVariants.length > 0 && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/80 font-medium">
                {imageVariants.length + 1} takes
              </div>
            )}
          </div>
        ) : !generatingImage && phase.showFrameActions ? (
          <button
            onClick={() => onGenerateImage(frame.id)}
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

        {/* Image variant strip */}
        {imageVariants.length > 0 && frame.imageUrl && (
          <VariantStrip
            variants={imageVariants}
            currentUrl={frame.imageUrl}
            type="image"
            frameId={frame.id}
            onSelect={onSelectVariant}
          />
        )}

        {/* Image prompt (editable) */}
        {editingPrompt ? (
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onBlur={() => {
              setEditingPrompt(false);
              if (promptText !== (frame.imagePrompt || "")) onUpdatePrompt(frame.id, promptText);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setPromptText(frame.imagePrompt || ""); setEditingPrompt(false); }
            }}
            autoFocus
            rows={2}
            className="w-full bg-black/40 border border-violet-500/20 rounded-lg px-2 py-1.5 text-[10px] text-gray-300 resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
          />
        ) : frame.imagePrompt ? (
          <p
            className="text-[10px] text-gray-500 leading-relaxed cursor-text hover:text-gray-400 transition-colors line-clamp-2"
            onClick={() => setEditingPrompt(true)}
          >
            {frame.imagePrompt}
          </p>
        ) : null}

        {/* Motion */}
        {(phase.showFrameMotion || frame.visualDescription) && (
          <div>
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[9px] uppercase tracking-wider text-emerald-600 font-medium">Motion</span>
              {isVideoStale && (
                <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[8px] font-bold uppercase">Stale</span>
              )}
              {!generatingMotion && frame.imageUrl && onRegenerateMotion && (
                <button
                  onClick={() => onRegenerateMotion(frame.id)}
                  className="text-[9px] text-emerald-500/60 hover:text-emerald-400 transition-colors ml-auto"
                >
                  Regen
                </button>
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
                onBlur={() => {
                  setEditingMotion(false);
                  if (motionText !== (frame.visualDescription || "")) onUpdateMotion(frame.id, motionText);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setMotionText(frame.visualDescription || ""); setEditingMotion(false); }
                }}
                autoFocus
                rows={2}
                className="w-full bg-black/40 border border-emerald-500/20 rounded-lg px-2 py-1.5 text-[10px] text-emerald-200 resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
              />
            ) : (
              <p
                className="text-[10px] text-emerald-400/70 cursor-text hover:text-emerald-300 transition-colors leading-relaxed line-clamp-2"
                onClick={() => setEditingMotion(true)}
              >
                {frame.visualDescription || "Click to add motion..."}
              </p>
            )}
          </div>
        )}

        {/* Video */}
        {phase.showFrameVideo && frame.videoUrl && (
          <div>
            <div className={`relative group ${isVideoStale ? "ring-1 ring-amber-500/40 rounded-lg" : ""}`}>
              <video
                src={frame.videoUrl}
                className="rounded-lg w-full max-h-28 object-cover bg-black"
                muted loop playsInline
                onMouseEnter={(e) => e.currentTarget.play()}
                onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
              />
              <div className={`absolute top-1 left-1 px-1 py-0.5 rounded text-white text-[8px] font-bold uppercase ${isVideoStale ? "bg-amber-500/80" : "bg-green-500/80"}`}>
                {isVideoStale ? "Stale" : "Ready"}
              </div>
              {!generatingVideo && (
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onRegenerateVideo(frame.id)}
                    className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors"
                  >
                    + Video
                  </button>
                  {videoVariants.length > 0 && (
                    <button
                      onClick={() => onCompare(frame, frameIndex, "video")}
                      className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600 transition-colors"
                    >
                      Compare
                    </button>
                  )}
                </div>
              )}
            </div>
            {videoVariants.length > 0 && frame.videoUrl && (
              <VariantStrip
                variants={videoVariants}
                currentUrl={frame.videoUrl}
                type="video"
                frameId={frame.id}
                onSelect={onSelectVariant}
              />
            )}
          </div>
        )}

        {phase.showFrameVideo && !frame.videoUrl && frame.imageUrl && !generatingVideo && (
          <button
            onClick={() => onRegenerateVideo(frame.id)}
            className="w-full py-2 rounded-lg border border-dashed border-white/10 text-[10px] text-gray-500 hover:text-violet-400 hover:border-violet-500/30 transition-colors"
          >
            Generate Video
          </button>
        )}

        {generatingVideo && (
          <div className="flex items-center gap-1.5 text-[9px] text-amber-400">
            <div className="animate-spin w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full" />
            Generating video...
          </div>
        )}
      </div>
    </div>
  );
}

// ── Scene Lab (main export) ──

export function SceneLab({
  scene,
  sceneIndex,
  video,
  phase,
  generatingFrameIds,
  generatingFrameVideoIds,
  generatingFrameMotionIds,
  onGenerateFrameImage,
  onUpdateFramePrompt,
  onUpdateFrameMotion,
  onRegenerateFrameVideo,
  onRegenerateFrameMotion,
  onSelectFrameVariant,
  onBack,
  onCompareFrame,
}: {
  scene: Scene;
  sceneIndex: number;
  video: VideoDetail | null;
  phase: VideoPhase;
  generatingFrameIds: Set<string>;
  generatingFrameVideoIds: Set<string>;
  generatingFrameMotionIds: Set<string>;
  onGenerateFrameImage: (frameId: string, prompt?: string) => void;
  onUpdateFramePrompt: (frameId: string, prompt: string) => void;
  onUpdateFrameMotion: (frameId: string, motion: string) => void;
  onRegenerateFrameVideo: (frameId: string, videoModel?: string) => void;
  onRegenerateFrameMotion: (frameId: string) => void;
  onSelectFrameVariant: (frameId: string, variantId: string, type: "image" | "video") => void;
  onBack: () => void;
  onCompareFrame: (frame: SceneFrame, frameIndex: number, type: "image" | "video") => void;
}) {
  // Escape to go back
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onBack();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack]);

  const frames = scene.frames ?? [];

  const {
    zoom, isPanning, containerRef, contentStyle,
    onWheel, onPointerDown, onPointerMove, onPointerUp,
    zoomIn, zoomOut, fitView, resetView,
  } = useCanvasTransform();

  const contentRef = useRef<HTMLDivElement>(null);

  function handleFitView() {
    const el = contentRef.current;
    if (!el) return;
    fitView(el.scrollWidth, el.scrollHeight);
  }

  return (
    <div className="flex-1 bg-grid relative overflow-hidden flex flex-col">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 px-6 pt-4 pb-2 shrink-0 z-10">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Storyboard
        </button>
        <span className="text-gray-700">/</span>
        <span className="text-[11px] text-white font-medium">
          Scene {sceneIndex + 1}
          {scene.sceneTitle && <span className="text-gray-400 ml-1.5">· {scene.sceneTitle}</span>}
        </span>
        <span className="ml-auto text-[10px] text-gray-600 font-mono">{scene.duration?.toFixed(1)}s</span>
      </div>

      {/* Pannable/zoomable frame flow */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ cursor: isPanning ? "grabbing" : undefined }}
      >
        <div
          ref={contentRef}
          style={contentStyle}
          className="flex gap-0 px-6 py-6 items-start h-full"
        >
          {/* Scene Brief */}
          <SceneBrief scene={scene} sceneIndex={sceneIndex} />

          {/* Connection line */}
          {frames.length > 0 && (
            <div className="w-5 h-px bg-white/10 shrink-0 self-center" />
          )}

          {/* Frame nodes */}
          {frames.map((frame, i) => (
            <Fragment key={frame.id}>
              <FrameNode
                frame={frame}
                frameIndex={i}
                phase={phase}
                generatingImage={generatingFrameIds.has(frame.id)}
                generatingVideo={generatingFrameVideoIds.has(frame.id)}
                generatingMotion={generatingFrameMotionIds.has(frame.id)}
                onGenerateImage={onGenerateFrameImage}
                onUpdatePrompt={onUpdateFramePrompt}
                onUpdateMotion={onUpdateFrameMotion}
                onRegenerateVideo={onRegenerateFrameVideo}
                onRegenerateMotion={onRegenerateFrameMotion}
                onSelectVariant={onSelectFrameVariant}
                onCompare={onCompareFrame}
              />
              {i < frames.length - 1 && (
                <div className="w-5 h-px bg-white/10 shrink-0 self-center" />
              )}
            </Fragment>
          ))}

          {/* No frames fallback — show scene's single image */}
          {frames.length === 0 && scene.assetUrl && (
            <>
              <div className="w-5 h-px bg-white/10 shrink-0 self-center" />
              <div className="w-56 shrink-0 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="px-3 py-2 border-b border-white/5">
                  <span className="text-[10px] uppercase tracking-wider text-cyan-500 font-medium">Scene Image</span>
                </div>
                <div className="p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={scene.assetUrl} alt="" className="rounded-lg w-full object-cover" />
                  {scene.imagePrompt && (
                    <p className="text-[10px] text-gray-500 mt-2 line-clamp-3 leading-relaxed">{scene.imagePrompt}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Zoom controls */}
        <ZoomControls
          zoom={zoom}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onFitView={handleFitView}
          onResetView={resetView}
        />
      </div>
    </div>
  );
}
