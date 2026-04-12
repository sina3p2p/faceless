"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";

import { useVideoActions } from "../hooks/use-video-actions";
import { useVideoPhase, type StudioPhaseId } from "../hooks/use-video-phase";
import { InspectorPanel, ScriptChatPanel } from "../components";
import type { Scene, SceneFrame } from "../types";

import { PhaseRail } from "./components/phase-rail";
import { StudioCanvas } from "./components/studio-canvas";
import { BottomDock } from "./components/bottom-dock";
import { CanvasOverlay } from "./components/canvas-overlay";
import { CompareWall } from "./components/compare-wall";

export default function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const actions = useVideoActions(id);
  const {
    scenes, setScenes, video, setVideo, loading,
    rendering, approving, generatingAll, generatingAllFrames, generatingMotion,
    generatingSceneIds, generatingFrameIds, generatingFrameVideoIds, generatingFrameMotionIds,
    downloadUrl, downloading, loadData,
    handleUpdateScene, handleUpdateAssetRefs, handleDeleteScene, handleUploadImage,
    generateImageForScene, handleGenerateAllImages, handleGenerateFrameImage,
    handleGenerateAllFrameImages, handleUpdateFramePrompt, handleUpdateFrameMotion,
    handleRegenerateFrameVideo, handleRegenerateFrameMotion, handleGenerateMotion,
    handleApprove, handleSaveStory, handleStartRendering, handleSelectMedia,
    handleSelectFrameVariant, handleRecompose, handleDownload, handleTogglePipelineMode, handleApplyRefinedScript,
  } = actions;

  const phase = useVideoPhase(video);
  const [selectedPhaseId, setSelectedPhaseId] = useState<StudioPhaseId>(phase.activePhaseId);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previousAssetUrl, setPreviousAssetUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [comparingFrame, setComparingFrame] = useState<{ frame: SceneFrame; frameIndex: number; type: "image" | "video" } | null>(null);

  // Follow active phase
  useEffect(() => {
    setSelectedPhaseId(phase.activePhaseId);
  }, [phase.activePhaseId]);

  // Polling during processing
  useEffect(() => {
    if (!phase.isProcessing) return;
    const interval = setInterval(() => loadData(), 3000);
    return () => clearInterval(interval);
  }, [video?.status, loadData, phase.isProcessing]);

  // Sync editing scene with fresh data
  useEffect(() => {
    if (editingScene) {
      const fresh = scenes.find((s) => s.id === editingScene.id);
      if (fresh && fresh.assetUrl !== editingScene.assetUrl) {
        setEditingScene({ ...fresh });
      }
    }
  }, [scenes, editingScene]);

  // When scene is selected, open it in inspector
  useEffect(() => {
    if (selectedSceneId) {
      const scene = scenes.find((s) => s.id === selectedSceneId);
      if (scene) setEditingScene(scene);
    }
  }, [selectedSceneId, scenes]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(scenes, oldIndex, newIndex).map((s, i) => ({ ...s, sceneOrder: i }));
    setScenes(reordered);
    fetch(`/api/videos/${id}/scenes/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIds: reordered.map((s) => s.id) }),
    });
  }

  async function handleGenerateImage(prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[], modelOverride?: string) {
    if (!editingScene) return;
    setPreviousAssetUrl(editingScene.assetUrl);
    setRegenerating(true);
    await generateImageForScene(editingScene.id, prompt, mode, referenceSceneIds, modelOverride);
    setRegenerating(false);
  }

  async function handleUndo() {
    if (!editingScene || !previousAssetUrl) return;
    setUndoing(true);
    try {
      await fetch(`/api/videos/${id}/scenes/${editingScene.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetUrl: previousAssetUrl }),
      });
      await loadData();
      const reverted = scenes.find((s) => s.id === editingScene.id);
      setEditingScene(reverted ? { ...reverted, assetUrl: previousAssetUrl } : null);
      setPreviousAssetUrl(null);
    } finally {
      setUndoing(false);
    }
  }

  const totalDuration = useMemo(() => scenes.reduce((s, sc) => s + sc.duration, 0), [scenes]);
  const allImagesGenerated = scenes.length > 0 && scenes.every((s) => s.assetUrl);
  const someImagesGenerated = scenes.some((s) => s.assetUrl);
  const allFrames = scenes.flatMap((s) => s.frames ?? []);
  const hasFrames = allFrames.length > 0;
  const allFrameImagesGenerated = hasFrames && allFrames.every((f) => f.imageUrl);
  const someFrameImagesGenerated = allFrames.some((f) => f.imageUrl);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;
  const currentPhase = phase.phases.find((p) => p.id === phase.activePhaseId);
  const imageModel = video?.series?.imageModel || "dall-e-3";
  const videoModel = video?.series?.videoModel || "—";

  // Find first frame with variants for compare action
  const comparableFrame = selectedScene?.frames?.find(
    (f) => (f.imageVariants && f.imageVariants.length > 0) || (f.videoVariants && f.videoVariants.length > 0)
  );
  const canCompare = !!comparableFrame;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 overflow-hidden">
      {/* ── Top Bar ── */}
      <div className="h-12 border-b border-white/5 bg-black/40 backdrop-blur-sm flex items-center px-4 gap-4 shrink-0">
        {/* Left: Back + Title + Phase */}
        <button
          onClick={() => router.push(video?.seriesId ? `/dashboard/series/${video.seriesId}` : "/dashboard/series")}
          className="text-gray-500 hover:text-white transition-colors px-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-sm font-semibold text-white truncate">
            {video?.title || "Untitled Project"}
          </h1>
          {currentPhase && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider shrink-0 ${
              currentPhase.status === "processing" ? "bg-violet-500/20 text-violet-400" :
              currentPhase.status === "review" ? "bg-amber-500/20 text-amber-400" :
              currentPhase.status === "done" ? "bg-emerald-500/20 text-emerald-400" :
              "bg-white/5 text-gray-500"
            }`}>
              {currentPhase.status === "processing" ? "Processing" :
               currentPhase.status === "review" ? "Review" :
               currentPhase.status === "done" ? "Complete" :
               currentPhase.label}
            </span>
          )}
        </div>

        {/* Center: Processing status */}
        {phase.isProcessing && phase.processingMessage ? (
          <div className="flex items-center gap-2 text-[11px] text-violet-400 flex-1 min-w-0 justify-center">
            <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full shrink-0" />
            <span className="truncate">{phase.processingMessage}</span>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Right: Stats + Toggle */}
        <div className="flex items-center gap-4 text-[11px] text-gray-500 shrink-0">
          <span>{scenes.length} scenes</span>
          {phase.hasTTSRun && <span className="font-mono">{totalDuration.toFixed(1)}s</span>}
          <span className="text-gray-600" title="Image model">{imageModel}</span>
          <span className="text-gray-600" title="Video model">{videoModel}</span>
        </div>

        <div onClick={handleTogglePipelineMode} className="flex items-center gap-1.5 cursor-pointer select-none shrink-0">
          <div className={`w-7 h-4 rounded-full transition-colors flex items-center px-0.5 ${video?.config?.pipelineMode === "auto" ? "bg-violet-500" : "bg-white/10"}`}>
            <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform ${video?.config?.pipelineMode === "auto" ? "translate-x-3" : "translate-x-0"}`} />
          </div>
          <span className="text-[10px] text-gray-500">{video?.config?.pipelineMode === "auto" ? "Auto" : "Manual"}</span>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex flex-1 min-h-0">
        <PhaseRail
          phases={phase.phases}
          activePhaseId={phase.activePhaseId}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={setSelectedPhaseId}
        />

        {/* Canvas wrapper */}
        <div className="flex-1 relative flex flex-col overflow-hidden">
          <StudioCanvas
            scenes={scenes}
            video={video}
            selectedSceneId={selectedSceneId}
            generatingSceneIds={generatingSceneIds}
            generatingFrameIds={generatingFrameIds}
            onSelectScene={(id) => {
              setSelectedSceneId(id);
              if (!id) {
                setEditingScene(null);
                setPreviousAssetUrl(null);
              }
            }}
            onDragEnd={handleDragEnd}
          />

          <CanvasOverlay
            selectedPhaseId={selectedPhaseId}
            phase={phase}
            video={video}
            scenes={scenes}
            setVideo={setVideo}
            onSaveStory={handleSaveStory}
            downloadUrl={downloadUrl}
            downloading={downloading}
            onDownload={handleDownload}
            rendering={rendering}
            onRecompose={handleRecompose}
          />

          <BottomDock
            phase={phase}
            selectedPhaseId={selectedPhaseId}
            selectedScene={selectedScene}
            hasScenes={scenes.length > 0}
            hasFrames={hasFrames}
            allImagesGenerated={allImagesGenerated}
            someImagesGenerated={someImagesGenerated}
            allFrameImagesGenerated={allFrameImagesGenerated}
            someFrameImagesGenerated={someFrameImagesGenerated}
            generatingAll={generatingAll}
            generatingAllFrames={generatingAllFrames}
            generatingMotion={generatingMotion}
            rendering={rendering}
            approving={approving}
            downloadUrl={downloadUrl}
            downloading={downloading}
            onApprove={handleApprove}
            onGenerateAllImages={handleGenerateAllImages}
            onGenerateAllFrameImages={handleGenerateAllFrameImages}
            onGenerateMotion={handleGenerateMotion}
            onStartRendering={handleStartRendering}
            onRecompose={handleRecompose}
            onDownload={handleDownload}
            canCompare={canCompare}
            onCompare={() => {
              if (comparableFrame) {
                const frameIndex = selectedScene?.frames?.indexOf(comparableFrame) ?? 0;
                const type = (comparableFrame.imageVariants?.length ?? 0) > 0 ? "image" as const : "video" as const;
                setComparingFrame({ frame: comparableFrame, frameIndex, type });
              }
            }}
            onEditScene={() => {
              if (selectedScene) setEditingScene(selectedScene);
            }}
            onDeleteScene={() => {
              if (selectedSceneId) {
                handleDeleteScene(selectedSceneId);
                setSelectedSceneId(null);
                setEditingScene(null);
              }
            }}
          />

          {/* Compare Wall overlay */}
          {comparingFrame && (
            <CompareWall
              frame={comparingFrame.frame}
              frameIndex={comparingFrame.frameIndex}
              type={comparingFrame.type}
              onSelect={(frameId, variantId, type) => {
                handleSelectFrameVariant(frameId, variantId, type);
                setComparingFrame(null);
              }}
              onRegenerate={(frameId) => {
                handleGenerateFrameImage(frameId);
                setComparingFrame(null);
              }}
              onClose={() => setComparingFrame(null)}
            />
          )}
        </div>

        {/* Inspector */}
        <InspectorPanel
          video={video}
          phase={phase}
          editingScene={editingScene}
          scenes={scenes}
          onCloseScene={() => { setEditingScene(null); setSelectedSceneId(null); setPreviousAssetUrl(null); }}
          onSubmitPrompt={handleGenerateImage}
          onUndo={previousAssetUrl ? handleUndo : null}
          onUploadImage={(file) => editingScene && handleUploadImage(editingScene.id, file)}
          onSelectMedia={handleSelectMedia}
          regenerating={regenerating}
          undoing={undoing}
          downloadUrl={downloadUrl}
          downloading={downloading}
          onDownload={handleDownload}
        />
      </div>

      {/* Floating chat */}
      {!chatOpen && scenes.length > 0 && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-500 transition-all hover:scale-105 z-40 flex items-center justify-center"
          title="Refine script with AI"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        </button>
      )}
      {chatOpen && (
        <ScriptChatPanel
          videoId={id}
          scenes={scenes}
          onApply={handleApplyRefinedScript}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
