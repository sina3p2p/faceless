"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";

import { useVideoActions } from "../hooks/use-video-actions";
import { useVideoPhase, type StudioPhaseId } from "../hooks/use-video-phase";
import { InspectorPanel, ScriptChatPanel, StudioTopBar } from "../components";
import type { Scene, SceneFrame } from "../types";

import { PhaseRail } from "./components/phase-rail";
import { StudioCanvas } from "./components/studio-canvas";
import { BottomDock } from "./components/bottom-dock";
import { CanvasOverlay } from "./components/canvas-overlay";
import { CompareWall } from "./components/compare-wall";
import { SceneLab } from "./components/scene-lab";
import { ModelCommand } from "./components/scene-lab/ModelCommand";
import { IMAGE_MODELS } from "@/lib/constants";
import StudioContext from "./context/StudioContext";

export default function StudioPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const actions = useVideoActions(id);
  const {
    scenes, setScenes, video, setVideo, loading,
    rendering, approving, generatingAll, generatingAllFrames, generatingMotion,
    generatingSceneIds, generatingFrameIds, generatingFrameVideoIds, generatingFrameMotionIds,
    downloadUrl, downloading, loadData, handleDeleteScene, handleUploadImage,
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
  const [labSceneId, setLabSceneId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<import("./context/StudioContext").SelectedMedia | null>(null);
  const [variantFrameId, setVariantFrameId] = useState<string | null>(null);

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

  const allImagesGenerated = scenes.length > 0 && scenes.every((s) => s.assetUrl);
  const someImagesGenerated = scenes.some((s) => s.assetUrl);
  const allFrames = scenes.flatMap((s) => s.frames ?? []);
  const hasFrames = allFrames.length > 0;
  const allFrameImagesGenerated = hasFrames && allFrames.every((f) => f.imageUrl);
  const someFrameImagesGenerated = allFrames.some((f) => f.imageUrl);

  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

  // Find first frame with variants for compare action
  const comparableFrame = selectedScene?.frames?.find(
    (f) => f.media && f.media.length > 0
  );
  const canCompare = !!comparableFrame;

  // Scene Lab mode
  const labScene = labSceneId ? scenes.find((s) => s.id === labSceneId) ?? null : null;
  const labSceneIndex = labSceneId ? scenes.findIndex((s) => s.id === labSceneId) : -1;
  const isLabMode = !!labScene;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <StudioContext.Provider value={{ scenes, setScenes, video, setVideo, selectedSceneId, setSelectedSceneId, editingScene, setEditingScene, selectedMedia, setSelectedMedia }}>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* ── Top Bar ── */}
        <StudioTopBar
          video={video}
          phase={phase}
          onBack={() => router.push(video?.seriesId ? `/dashboard/series/${video.seriesId}` : "/dashboard/series")}
          onTogglePipelineMode={handleTogglePipelineMode}
        />

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
            {isLabMode && labScene ? (
              <SceneLab
                scene={labScene}
                sceneIndex={labSceneIndex}
                video={video}
                phase={phase}
                generatingFrameIds={generatingFrameIds}
                generatingFrameVideoIds={generatingFrameVideoIds}
                generatingFrameMotionIds={generatingFrameMotionIds}
                onGenerateFrameImage={handleGenerateFrameImage}
                onUpdateFramePrompt={handleUpdateFramePrompt}
                onUpdateFrameMotion={handleUpdateFrameMotion}
                onRegenerateFrameVideo={handleRegenerateFrameVideo}
                onRegenerateFrameMotion={handleRegenerateFrameMotion}
                onSelectFrameVariant={handleSelectFrameVariant}
                onRefreshData={loadData}
                onBack={() => setLabSceneId(null)}
              />
            ) : (
              <>
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
                  onOpenLab={(sceneId) => setLabSceneId(sceneId)}
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
              </>
            )}

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
                  const type = comparableFrame.media?.some(m => m.type === "image") ? "image" as const : "video" as const;
                  setComparingFrame({ frame: comparableFrame, frameIndex, type });
                }
              }}
              isLabMode={isLabMode}
              onExitLab={() => setLabSceneId(null)}
              hasLabFrames={!!(selectedScene?.frames && selectedScene.frames.length > 0)}
              onOpenLab={() => {
                if (selectedSceneId) setLabSceneId(selectedSceneId);
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
              selectedMedia={selectedMedia}
              onUseMediaForVideo={(mediaId, frameId) => {
                handleSelectFrameVariant(frameId, mediaId, "image");
                setSelectedMedia(null);
              }}
              onGenerateVariant={(frameId) => {
                setVariantFrameId(frameId);
              }}
              onDeleteMedia={async (mediaId) => {
                await fetch(`/api/videos/${id}/media/${mediaId}`, { method: "DELETE" });
                await loadData();
                setSelectedMedia(null);
              }}
            />

            {/* Model Command Palette */}
            {variantFrameId && (
              <ModelCommand
                models={IMAGE_MODELS}
                title="Generate variant with..."
                onSelect={(modelId) => {
                  handleGenerateFrameImage(variantFrameId, undefined, modelId);
                  setVariantFrameId(null);
                }}
                onClose={() => setVariantFrameId(null)}
              />
            )}

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
    </StudioContext.Provider>
  );
}
