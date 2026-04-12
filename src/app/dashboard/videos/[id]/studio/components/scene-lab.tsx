"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { IMAGE_MODELS, VIDEO_MODELS } from "@/lib/constants";
import type { Scene, SceneFrame, FrameVariant, VideoDetail } from "../../types";
import type { VideoPhase } from "../../hooks/use-video-phase";
import { useCanvasTransform } from "../hooks/use-canvas-transform";
import { ZoomControls } from "./zoom-controls";

// ── Model Selector (inline popover) ──

function ModelSelector({
  type,
  defaultModel,
  onGenerate,
  onCancel,
}: {
  type: "image" | "video";
  defaultModel: string;
  onGenerate: (model: string) => void;
  onCancel: () => void;
}) {
  const models = type === "image" ? IMAGE_MODELS : VIDEO_MODELS;
  const [selected, setSelected] = useState(defaultModel || models[0]?.id || "");

  return (
    <div className="mt-1.5 rounded-lg bg-black/60 border border-white/10 p-2 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {models.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelected(m.id); }}
            className={`px-2 py-0.5 rounded text-[9px] font-medium transition-colors ${
              selected === m.id
                ? "bg-violet-600 text-white"
                : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
            title={m.description}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(selected); }}
          className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[9px] font-medium hover:bg-violet-500 transition-colors"
        >
          Generate
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          className="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 text-[9px] font-medium hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Variant Node (single take thumbnail in tree) ──

function VariantNode({
  url,
  type,
  modelUsed,
  isActive,
  onClick,
}: {
  url: string;
  type: "image" | "video";
  modelUsed: string | null;
  isActive: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      disabled={isActive}
      className={`shrink-0 flex flex-col items-center gap-1 group/vnode transition-all ${
        isActive ? "" : "opacity-50 hover:opacity-100"
      }`}
    >
      <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors relative ${
        isActive
          ? "border-violet-500 ring-1 ring-violet-500/30"
          : "border-white/10 group-hover/vnode:border-white/30"
      }`}>
        {type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-full h-full object-cover" />
        ) : (
          <video src={url} className="w-full h-full object-cover" muted />
        )}
        {isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-violet-500/20">
            <svg className="w-3 h-3 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/vnode:opacity-100 transition-opacity">
            <span className="text-[8px] text-white font-semibold">Use</span>
          </div>
        )}
      </div>
      <span className="text-[7px] text-gray-600 truncate max-w-14 leading-none">
        {modelUsed || "—"}
      </span>
    </button>
  );
}

// ── Scene Brief Card ──

function SceneBrief({ scene, sceneIndex }: { scene: Scene; sceneIndex: number }) {
  return (
    <div className="w-52 shrink-0 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden self-start">
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
          <span className="text-[10px] font-mono text-gray-600">{scene.duration?.toFixed(1)}s</span>
          {scene.frames && scene.frames.length > 0 && (
            <span className="text-[9px] text-gray-700">{scene.frames.length} frames</span>
          )}
        </div>
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

// ── Frame Column: FrameNode card + variant branches below ──

function FrameColumn({
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

  useEffect(() => { setPromptText(frame.imagePrompt || ""); }, [frame.imagePrompt]);
  useEffect(() => { setMotionText(frame.visualDescription || ""); }, [frame.visualDescription]);

  const imageVariants = frame.imageVariants ?? [];
  const videoVariants = frame.videoVariants ?? [];
  const hasImageVariants = imageVariants.length > 0;
  const hasVideoVariants = videoVariants.length > 0;

  const isVideoStale = !!(
    frame.videoUrl && frame.imageGeneratedAt && frame.videoGeneratedAt &&
    frame.imageGeneratedAt > frame.videoGeneratedAt
  );

  return (
    <div className="flex flex-col items-center shrink-0">
      {/* ── Frame Card ── */}
      <div className="w-56 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden">
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

          {/* Image model selector */}
          {showImageModelPicker && (
            <ModelSelector
              type="image"
              defaultModel={defaultImageModel}
              onGenerate={(model) => { onGenerateImage(frame.id, undefined, model); setShowImageModelPicker(false); }}
              onCancel={() => setShowImageModelPicker(false)}
            />
          )}

          {/* Image prompt (editable) */}
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
          {showVideoModelPicker && (
            <ModelSelector
              type="video"
              defaultModel={defaultVideoModel}
              onGenerate={(model) => { onRegenerateVideo(frame.id, model); setShowVideoModelPicker(false); }}
              onCancel={() => setShowVideoModelPicker(false)}
            />
          )}

          {generatingVideo && (
            <div className="flex items-center gap-1.5 text-[9px] text-amber-400">
              <div className="animate-spin w-2.5 h-2.5 border border-amber-400 border-t-transparent rounded-full" />
              Generating video...
            </div>
          )}
        </div>
      </div>

      {/* ── Variant Tree (branches below card) ── */}
      {/* Image variant branches */}
      {hasImageVariants && frame.imageUrl && (
        <div className="flex flex-col items-center mt-1">
          {/* Stem line from card to branch row */}
          <div className="w-px h-3 bg-violet-500/30" />
          <div className="flex gap-1.5 items-start">
            {/* Active take */}
            <VariantNode url={frame.imageUrl} type="image" modelUsed={frame.modelUsed ?? null} isActive onClick={() => {}} />
            {/* Previous variants */}
            {imageVariants.map((v) => (
              <VariantNode key={v.id} url={v.url} type="image" modelUsed={v.modelUsed} isActive={false} onClick={() => onSelectVariant(frame.id, v.id, "image")} />
            ))}
          </div>
        </div>
      )}

      {/* Video variant branches */}
      {hasVideoVariants && frame.videoUrl && (
        <div className="flex flex-col items-center mt-1">
          <div className="w-px h-3 bg-emerald-500/30" />
          <div className="flex gap-1.5 items-start">
            <VariantNode url={frame.videoUrl} type="video" modelUsed={frame.modelUsed ?? null} isActive onClick={() => {}} />
            {videoVariants.map((v) => (
              <VariantNode key={v.id} url={v.url} type="video" modelUsed={v.modelUsed} isActive={false} onClick={() => onSelectVariant(frame.id, v.id, "video")} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Horizontal connector between frame columns ──
// Draws from the active variant of frame N to frame N+1.
// Active path = violet, inactive = subtle white.

function FrameConnector({ hasVariants }: { hasVariants: boolean }) {
  return (
    <div className="flex flex-col items-center shrink-0 self-start" style={{ paddingTop: "5rem" }}>
      {/* Main horizontal line at frame-card mid-height */}
      <div className={`w-8 h-px transition-colors ${hasVariants ? "bg-violet-500/40" : "bg-white/10"}`} />
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
  onGenerateFrameImage: (frameId: string, prompt?: string, model?: string) => void;
  onUpdateFramePrompt: (frameId: string, prompt: string) => void;
  onUpdateFrameMotion: (frameId: string, motion: string) => void;
  onRegenerateFrameVideo: (frameId: string, videoModel?: string) => void;
  onRegenerateFrameMotion: (frameId: string) => void;
  onSelectFrameVariant: (frameId: string, variantId: string, type: "image" | "video") => void;
  onBack: () => void;
  onCompareFrame: (frame: SceneFrame, frameIndex: number, type: "image" | "video") => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onBack(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onBack]);

  const frames = scene.frames ?? [];
  const defaultImageModel = video?.series?.imageModel || "dall-e-3";
  const defaultVideoModel = video?.series?.videoModel || "";

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
        <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-white transition-colors">
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

      {/* Pannable/zoomable canvas */}
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

          {/* Brief → first frame connector */}
          {frames.length > 0 && <FrameConnector hasVariants={false} />}

          {/* Frame columns with connectors */}
          {frames.map((frame, i) => (
            <Fragment key={frame.id}>
              <FrameColumn
                frame={frame}
                frameIndex={i}
                phase={phase}
                defaultImageModel={defaultImageModel}
                defaultVideoModel={defaultVideoModel}
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
                <FrameConnector
                  hasVariants={
                    (frame.imageVariants?.length ?? 0) > 0 ||
                    (frame.videoVariants?.length ?? 0) > 0
                  }
                />
              )}
            </Fragment>
          ))}

          {/* No frames fallback */}
          {frames.length === 0 && scene.assetUrl && (
            <>
              <FrameConnector hasVariants={false} />
              <div className="w-56 shrink-0 rounded-xl border border-white/10 bg-white/[0.02] overflow-hidden self-start">
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

        <ZoomControls zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onFitView={handleFitView} onResetView={resetView} />
      </div>
    </div>
  );
}
