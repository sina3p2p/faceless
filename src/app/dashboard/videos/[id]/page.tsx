"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { useVideoActions } from "./hooks/use-video-actions";
import { useVideoPhase, type StudioPhaseId, type VideoPhase } from "./hooks/use-video-phase";
import {
  SortableSceneCard, PromptEditModal, ScriptChatPanel, FullStoryView,
  PhaseSidebar, StudioTopBar, InspectorPanel,
} from "./components";
import type { Scene, VideoDetail, SceneUpdates } from "./types";

export default function ReviewPage() {
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
    handleDownload, handleTogglePipelineMode, handleApplyRefinedScript,
  } = actions;

  const phase = useVideoPhase(video);
  const [selectedPhaseId, setSelectedPhaseId] = useState<StudioPhaseId>(phase.activePhaseId);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previousAssetUrl, setPreviousAssetUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const isMusicVideo = video?.series?.videoType === "music_video";

  // Follow active phase when it changes
  useEffect(() => {
    setSelectedPhaseId(phase.activePhaseId);
  }, [phase.activePhaseId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!phase.isProcessing) return;
    const interval = setInterval(() => loadData(), 3000);
    return () => clearInterval(interval);
  }, [video?.status, loadData, isMusicVideo, phase.isProcessing]);

  useEffect(() => {
    if (editingScene) {
      const fresh = scenes.find((s) => s.id === editingScene.id);
      if (fresh && fresh.assetUrl !== editingScene.assetUrl) {
        setEditingScene({ ...fresh });
      }
    }
  }, [scenes, editingScene]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -m-8 overflow-hidden">
      {/* Top bar */}
      <StudioTopBar
        video={video}
        phase={phase}
        totalDuration={totalDuration}
        scenesCount={scenes.length}
        onBack={() => router.push(video?.seriesId ? `/dashboard/series/${video.seriesId}` : "/dashboard/series")}
        onTogglePipelineMode={handleTogglePipelineMode}
      />

      {/* Main studio area: sidebar + center + inspector */}
      <div className="flex flex-1 min-h-0">
        {/* Phase sidebar */}
        <PhaseSidebar
          phases={phase.phases}
          activePhaseId={phase.activePhaseId}
          selectedPhaseId={selectedPhaseId}
          onSelectPhase={setSelectedPhaseId}
        />

        {/* Center panel */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-6">
            <CenterPanel
              selectedPhaseId={selectedPhaseId}
              phase={phase}
              video={video}
              scenes={scenes}
              setVideo={setVideo}
              sensors={sensors}
              selectedSceneId={selectedSceneId}
              setSelectedSceneId={setSelectedSceneId}
              setEditingScene={setEditingScene}
              isMusicVideo={isMusicVideo}
              hasFrames={hasFrames}
              allImagesGenerated={allImagesGenerated}
              allFrameImagesGenerated={allFrameImagesGenerated}
              someImagesGenerated={someImagesGenerated}
              someFrameImagesGenerated={someFrameImagesGenerated}
              generatingAll={generatingAll}
              generatingAllFrames={generatingAllFrames}
              generatingMotion={generatingMotion}
              rendering={rendering}
              approving={approving}
              downloadUrl={downloadUrl}
              downloading={downloading}
              generatingSceneIds={generatingSceneIds}
              generatingFrameIds={generatingFrameIds}
              generatingFrameVideoIds={generatingFrameVideoIds}
              generatingFrameMotionIds={generatingFrameMotionIds}
              onDragEnd={handleDragEnd}
              onUpdateScene={handleUpdateScene}
              onUpdateAssetRefs={handleUpdateAssetRefs}
              onDeleteScene={handleDeleteScene}
              onUploadImage={handleUploadImage}
              onGenerateAllImages={handleGenerateAllImages}
              onGenerateAllFrameImages={handleGenerateAllFrameImages}
              onGenerateFrameImage={handleGenerateFrameImage}
              onUpdateFramePrompt={handleUpdateFramePrompt}
              onUpdateFrameMotion={handleUpdateFrameMotion}
              onRegenerateFrameVideo={handleRegenerateFrameVideo}
              onRegenerateFrameMotion={handleRegenerateFrameMotion}
              onGenerateMotion={handleGenerateMotion}
              onApprove={handleApprove}
              onSaveStory={handleSaveStory}
              onStartRendering={handleStartRendering}
              onDownload={handleDownload}
            />
          </div>
        </div>

        {/* Inspector panel */}
        <InspectorPanel video={video} phase={phase} />
      </div>

      {/* Prompt edit modal */}
      {editingScene && (
        <PromptEditModal
          scene={editingScene}
          scenes={scenes}
          imageModel={video?.series?.imageModel || "dall-e-3"}
          videoId={id}
          onClose={() => { setEditingScene(null); setPreviousAssetUrl(null); }}
          onSubmit={handleGenerateImage}
          onUndo={previousAssetUrl ? handleUndo : null}
          onUploadImage={(file) => handleUploadImage(editingScene.id, file)}
          onSelectMedia={handleSelectMedia}
          regenerating={regenerating}
          undoing={undoing}
        />
      )}

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

// ── Center Panel — routes content based on selected phase ──

function CenterPanel({
  selectedPhaseId, phase, video, scenes, setVideo,
  sensors, selectedSceneId, setSelectedSceneId, setEditingScene,
  isMusicVideo, hasFrames,
  allImagesGenerated, allFrameImagesGenerated, someImagesGenerated, someFrameImagesGenerated,
  generatingAll, generatingAllFrames, generatingMotion, rendering, approving,
  downloadUrl, downloading,
  generatingSceneIds, generatingFrameIds, generatingFrameVideoIds, generatingFrameMotionIds,
  onDragEnd, onUpdateScene, onUpdateAssetRefs, onDeleteScene, onUploadImage,
  onGenerateAllImages, onGenerateAllFrameImages, onGenerateFrameImage,
  onUpdateFramePrompt, onUpdateFrameMotion, onRegenerateFrameVideo, onRegenerateFrameMotion,
  onGenerateMotion, onApprove, onSaveStory, onStartRendering, onDownload,
}: {
  selectedPhaseId: StudioPhaseId;
  phase: VideoPhase;
  video: VideoDetail | null;
  scenes: Scene[];
  setVideo: React.Dispatch<React.SetStateAction<VideoDetail | null>>;
  sensors: ReturnType<typeof useSensors>;
  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;
  setEditingScene: (scene: Scene | null) => void;
  isMusicVideo: boolean;
  hasFrames: boolean;
  allImagesGenerated: boolean;
  allFrameImagesGenerated: boolean;
  someImagesGenerated: boolean;
  someFrameImagesGenerated: boolean;
  generatingAll: boolean;
  generatingAllFrames: boolean;
  generatingMotion: boolean;
  rendering: boolean;
  approving: boolean;
  downloadUrl: string | null;
  downloading: boolean;
  generatingSceneIds: Set<string>;
  generatingFrameIds: Set<string>;
  generatingFrameVideoIds: Set<string>;
  generatingFrameMotionIds: Set<string>;
  onDragEnd: (event: DragEndEvent) => void;
  onUpdateScene: (id: string, updates: SceneUpdates) => void;
  onUpdateAssetRefs: (id: string, refs: string[]) => void;
  onDeleteScene: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  onGenerateAllImages: (regen: boolean) => void;
  onGenerateAllFrameImages: (regen: boolean) => void;
  onGenerateFrameImage: (frameId: string, prompt?: string) => void;
  onUpdateFramePrompt: (frameId: string, prompt: string) => void;
  onUpdateFrameMotion: (frameId: string, motion: string) => void;
  onRegenerateFrameVideo: (frameId: string, videoModel?: string) => void;
  onRegenerateFrameMotion: (frameId: string) => void;
  onGenerateMotion: () => void;
  onApprove: (endpoint: string) => void;
  onSaveStory: (markdown: string) => void;
  onStartRendering: () => void;
  onDownload: () => void;
}) {
  // Story Phase
  if (selectedPhaseId === "story") {
    return (
      <>
        {phase.isProcessing && ["PRODUCING", "STORY", "SCENE_SPLIT", "SCRIPT_SUPERVISION"].includes(video?.status || "") && (
          <ProcessingIndicator message={phase.processingMessage} />
        )}

        {phase.isStoryReview && video?.script && (
          <div className="space-y-4">
            <StatusBanner color="violet">
              Review the creative brief, story, scenes, and continuity notes below.
              Edit the story directly if needed. When you&apos;re happy, approve to generate audio.
            </StatusBanner>
            <Card>
              <CardContent className="p-6">
                <textarea
                  value={video.script}
                  onChange={(e) => setVideo((prev) => prev ? { ...prev, script: e.target.value } : prev)}
                  onBlur={() => { if (video.script) onSaveStory(video.script); }}
                  rows={20}
                  className="w-full bg-transparent border-none text-sm text-gray-200 resize-y focus:outline-none leading-relaxed font-mono"
                  placeholder="Your story will appear here..."
                />
              </CardContent>
            </Card>
            <div className="flex justify-center">
              <Button variant="primary" size="lg" loading={approving} onClick={() => onApprove("approve-story")}>
                Approve Story &amp; Generate Audio
              </Button>
            </div>
          </div>
        )}

        {(phase.isScenesReview || phase.isNarrationReview) && (
          <>
            <StatusBanner color="violet">
              {phase.isScenesReview ? "Review the scene breakdown below. Edit any scene, then approve to generate audio." : "Review your narration below. When you're happy with the story, generate preview images."}
            </StatusBanner>
            {phase.isNarrationReview && <FullStoryView scenes={scenes} />}
          </>
        )}

        {/* Scene list for story phase */}
        {!phase.isProcessing && scenes.length > 0 && (
          <SceneList
            scenes={scenes} sensors={sensors} selectedSceneId={selectedSceneId}
            setSelectedSceneId={setSelectedSceneId} setEditingScene={setEditingScene}
            isMusicVideo={isMusicVideo} video={video} phase={phase}
            generatingSceneIds={generatingSceneIds} generatingFrameIds={generatingFrameIds}
            generatingFrameVideoIds={generatingFrameVideoIds} generatingFrameMotionIds={generatingFrameMotionIds}
            onDragEnd={onDragEnd} onUpdateScene={onUpdateScene} onUpdateAssetRefs={onUpdateAssetRefs}
            onDeleteScene={onDeleteScene} onUploadImage={onUploadImage}
            onGenerateFrameImage={onGenerateFrameImage} onUpdateFramePrompt={onUpdateFramePrompt}
            onUpdateFrameMotion={onUpdateFrameMotion} onRegenerateFrameVideo={onRegenerateFrameVideo}
            onRegenerateFrameMotion={onRegenerateFrameMotion}
          />
        )}

        {phase.isScenesReview && scenes.length > 0 && (
          <div className="mt-4 flex justify-center">
            <Button variant="primary" loading={approving} onClick={() => onApprove("approve-story")}>Approve Scenes &amp; Generate Audio</Button>
          </div>
        )}
      </>
    );
  }

  // Pre-Production Phase
  if (selectedPhaseId === "pre-production") {
    return (
      <>
        {phase.isProcessing && ["TTS_GENERATION", "CINEMATOGRAPHY", "STORYBOARD"].includes(video?.status || "") && (
          <ProcessingIndicator message={phase.processingMessage} />
        )}

        {phase.isPreProductionReview && video && (
          <PreProductionReview video={video} approving={approving} onApprove={onApprove} />
        )}

        {(phase.isTTSReview || phase.isPromptsReview) && (
          <>
            <StatusBanner color={phase.isTTSReview ? "emerald" : "amber"}>
              {phase.isTTSReview
                ? "Listen to the generated audio for each scene. When you're satisfied, approve to generate image prompts."
                : "Review the image prompts for each frame. Edit any prompt before generating images to save on generation costs."}
            </StatusBanner>
            <SceneList
              scenes={scenes} sensors={sensors} selectedSceneId={selectedSceneId}
              setSelectedSceneId={setSelectedSceneId} setEditingScene={setEditingScene}
              isMusicVideo={isMusicVideo} video={video} phase={phase}
              generatingSceneIds={generatingSceneIds} generatingFrameIds={generatingFrameIds}
              generatingFrameVideoIds={generatingFrameVideoIds} generatingFrameMotionIds={generatingFrameMotionIds}
              onDragEnd={onDragEnd} onUpdateScene={onUpdateScene} onUpdateAssetRefs={onUpdateAssetRefs}
              onDeleteScene={onDeleteScene} onUploadImage={onUploadImage}
              onGenerateFrameImage={onGenerateFrameImage} onUpdateFramePrompt={onUpdateFramePrompt}
              onUpdateFrameMotion={onUpdateFrameMotion} onRegenerateFrameVideo={onRegenerateFrameVideo}
              onRegenerateFrameMotion={onRegenerateFrameMotion}
            />
            <div className="mt-4 flex justify-center">
              <Button variant="primary" loading={approving} onClick={() => onApprove("approve-pre-production")}>
                {phase.isTTSReview ? "Approve Audio & Generate Prompts" : "Approve Prompts & Generate Images"}
              </Button>
            </div>
          </>
        )}
      </>
    );
  }

  // Production Phase
  if (selectedPhaseId === "production") {
    return (
      <>
        {phase.isProcessing && ["PROMPT_GENERATION", "IMAGE_GENERATION", "MOTION_GENERATION", "VIDEO_GENERATION"].includes(video?.status || "") && (
          <ProcessingIndicator message={phase.processingMessage} />
        )}

        {(phase.isImagesReview || phase.isImageReview) && (
          <StatusBanner color="cyan">
            Review the generated images below. Regenerate any you don&apos;t like, then approve to continue.
          </StatusBanner>
        )}

        {(phase.isProductionReview || phase.isNewMotionReview || phase.isVideoReview || phase.isMotionReview) && (
          <StatusBanner color={phase.isMotionReview ? "emerald" : "amber"}>
            {phase.isMotionReview || phase.isNewMotionReview
              ? "Review the motion descriptions below. Edit any descriptions, then generate video clips."
              : "Review the generated video clips below. Approve to compose the final video."}
          </StatusBanner>
        )}

        {generatingMotion && (
          <StatusBanner color="violet" icon="spinner">
            Generating motion descriptions for each scene using AI vision...
          </StatusBanner>
        )}

        {!phase.isProcessing && scenes.length > 0 && (
          <SceneList
            scenes={scenes} sensors={sensors} selectedSceneId={selectedSceneId}
            setSelectedSceneId={setSelectedSceneId} setEditingScene={setEditingScene}
            isMusicVideo={isMusicVideo} video={video} phase={phase}
            generatingSceneIds={generatingSceneIds} generatingFrameIds={generatingFrameIds}
            generatingFrameVideoIds={generatingFrameVideoIds} generatingFrameMotionIds={generatingFrameMotionIds}
            onDragEnd={onDragEnd} onUpdateScene={onUpdateScene} onUpdateAssetRefs={onUpdateAssetRefs}
            onDeleteScene={onDeleteScene} onUploadImage={onUploadImage}
            onGenerateFrameImage={onGenerateFrameImage} onUpdateFramePrompt={onUpdateFramePrompt}
            onUpdateFrameMotion={onUpdateFrameMotion} onRegenerateFrameVideo={onRegenerateFrameVideo}
            onRegenerateFrameMotion={onRegenerateFrameMotion}
          />
        )}

        {/* Production action buttons */}
        {scenes.length > 0 && !phase.isProcessing && !generatingMotion && (
          <div className="mt-6 flex justify-center gap-3">
            {(phase.isImagesReview || phase.isImageReview) && (
              <>
                <Button variant="outline" loading={generatingAllFrames || generatingAll} onClick={() => hasFrames ? onGenerateAllFrameImages(true) : onGenerateAllImages(true)}>Regenerate All Images</Button>
                <Button variant="primary" loading={approving} onClick={() => onApprove(phase.isImagesReview ? "approve-images" : "approve-production")}>Approve &amp; Continue</Button>
              </>
            )}
            {(phase.isMotionReview || phase.isNewMotionReview) && (
              <>
                <Button variant="outline" loading={generatingMotion} onClick={onGenerateMotion}>Regenerate Motion</Button>
                <Button variant="primary" loading={phase.isNewMotionReview ? approving : rendering} onClick={() => phase.isNewMotionReview ? onApprove("approve-production") : onStartRendering()}>
                  {phase.isNewMotionReview ? "Approve Motion & Generate Video" : "Generate Video"}
                </Button>
              </>
            )}
            {(phase.isProductionReview || phase.isVideoReview) && (
              <Button variant="primary" loading={approving} onClick={() => onApprove("approve-production")}>Approve &amp; Compose Final Video</Button>
            )}
            {!phase.isImagesReview && !phase.isImageReview && !phase.isMotionReview && !phase.isNewMotionReview && !phase.isProductionReview && !phase.isVideoReview && (
              <>
                {!allImagesGenerated && !allFrameImagesGenerated && (
                  <Button variant="outline" loading={generatingAll || generatingAllFrames} onClick={() => hasFrames ? onGenerateAllFrameImages(false) : onGenerateAllImages(false)}>
                    {(someImagesGenerated || someFrameImagesGenerated) ? "Generate Remaining" : "Generate Preview Images"}
                  </Button>
                )}
                <Button variant="primary" loading={rendering} onClick={onStartRendering}>Generate Video</Button>
              </>
            )}
          </div>
        )}
      </>
    );
  }

  // Final Phase
  return (
    <>
      {phase.isProcessing && video?.status === "RENDERING" && (
        <ProcessingIndicator message={phase.processingMessage} />
      )}

      {video?.status === "COMPLETED" && (
        <Card className="mb-6">
          <CardContent className="py-6">
            {(() => {
              const vs = video.series?.videoSize || "9:16";
              const arCss = vs === "16:9" ? "16/9" : vs === "1:1" ? "1/1" : "9/16";
              const maxW = vs === "16:9" ? "max-w-2xl" : vs === "1:1" ? "max-w-md" : "max-w-xs";
              return downloadUrl ? (
                <div className={`${maxW} mx-auto rounded-xl overflow-hidden bg-black mb-4`} style={{ aspectRatio: arCss }}>
                  <video src={downloadUrl} controls className="w-full h-full object-contain" />
                </div>
              ) : (
                <div className={`${maxW} mx-auto rounded-xl bg-white/5 flex items-center justify-center mb-4 h-48`}>
                  <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
                </div>
              );
            })()}
            <div className="flex justify-center gap-3">
              <Button loading={downloading} onClick={onDownload}>Download MP4</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Show scenes for completed videos (post-completion editing) */}
      {video?.status === "COMPLETED" && scenes.length > 0 && (
        <>
          <div className="mb-4">
            <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Scenes</span>
          </div>
          <SceneList
            scenes={scenes} sensors={sensors} selectedSceneId={selectedSceneId}
            setSelectedSceneId={setSelectedSceneId} setEditingScene={setEditingScene}
            isMusicVideo={isMusicVideo} video={video} phase={phase}
            generatingSceneIds={generatingSceneIds} generatingFrameIds={generatingFrameIds}
            generatingFrameVideoIds={generatingFrameVideoIds} generatingFrameMotionIds={generatingFrameMotionIds}
            onDragEnd={onDragEnd} onUpdateScene={onUpdateScene} onUpdateAssetRefs={onUpdateAssetRefs}
            onDeleteScene={onDeleteScene} onUploadImage={onUploadImage}
            onGenerateFrameImage={onGenerateFrameImage} onUpdateFramePrompt={onUpdateFramePrompt}
            onUpdateFrameMotion={onUpdateFrameMotion} onRegenerateFrameVideo={onRegenerateFrameVideo}
            onRegenerateFrameMotion={onRegenerateFrameMotion}
          />
        </>
      )}
    </>
  );
}

// ── Shared sub-components ──

function StatusBanner({ color, icon, children }: { color: string; icon?: "spinner"; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-300",
  };
  return (
    <div className={`mb-4 rounded-xl border p-4 ${colors[color] || colors.violet} ${icon === "spinner" ? "flex items-center gap-3" : ""}`}>
      {icon === "spinner" && <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full shrink-0" />}
      <p className="text-sm">{children}</p>
    </div>
  );
}

function ProcessingIndicator({ message }: { message: string }) {
  return (
    <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 flex flex-col items-center gap-3">
      <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      <p className="text-sm text-violet-300">{message}</p>
    </div>
  );
}

function SceneList({ scenes, sensors, selectedSceneId, setSelectedSceneId, setEditingScene, isMusicVideo, video, phase, generatingSceneIds, generatingFrameIds, generatingFrameVideoIds, generatingFrameMotionIds, onDragEnd, onUpdateScene, onUpdateAssetRefs, onDeleteScene, onUploadImage, onGenerateFrameImage, onUpdateFramePrompt, onUpdateFrameMotion, onRegenerateFrameVideo, onRegenerateFrameMotion }: {
  scenes: Scene[];
  sensors: ReturnType<typeof useSensors>;
  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;
  setEditingScene: (scene: Scene | null) => void;
  isMusicVideo: boolean;
  video: VideoDetail | null;
  phase: VideoPhase;
  generatingSceneIds: Set<string>;
  generatingFrameIds: Set<string>;
  generatingFrameVideoIds: Set<string>;
  generatingFrameMotionIds: Set<string>;
  onDragEnd: (event: DragEndEvent) => void;
  onUpdateScene: (id: string, updates: SceneUpdates) => void;
  onUpdateAssetRefs: (id: string, refs: string[]) => void;
  onDeleteScene: (id: string) => void;
  onUploadImage: (id: string, file: File) => void;
  onGenerateFrameImage: (frameId: string, prompt?: string) => void;
  onUpdateFramePrompt: (frameId: string, prompt: string) => void;
  onUpdateFrameMotion: (frameId: string, motion: string) => void;
  onRegenerateFrameVideo: (frameId: string, videoModel?: string) => void;
  onRegenerateFrameMotion: (frameId: string) => void;
}) {
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {scenes.map((scene, i) => (
            <SortableSceneCard
              key={scene.id}
              scene={scene}
              index={i}
              isSelected={scene.id === selectedSceneId}
              onSelect={() => setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)}
              onDelete={() => { onDeleteScene(scene.id); if (selectedSceneId === scene.id) setSelectedSceneId(null); }}
              onUpdate={(updates) => onUpdateScene(scene.id, updates)}
              onEditPrompt={() => setEditingScene(scene)}
              onUploadImage={(file) => onUploadImage(scene.id, file)}
              onUpdateAssetRefs={(refs) => onUpdateAssetRefs(scene.id, refs)}
              generatingImage={generatingSceneIds.has(scene.id)}
              isMusicVideo={isMusicVideo}
              isDialogue={video?.series?.videoType === "dialogue"}
              storyAssets={video?.series?.storyAssets ?? []}
              showMotionEdit={phase.showMotionEdit}
              showDirectorNote={phase.showDirectorNote}
              showAudioPlayer={phase.showAudioPlayer}
              showDuration={phase.showDuration}
              onGenerateFrameImage={onGenerateFrameImage}
              onUpdateFramePrompt={onUpdateFramePrompt}
              onUpdateFrameMotion={onUpdateFrameMotion}
              onRegenerateFrameVideo={onRegenerateFrameVideo}
              onRegenerateFrameMotion={onRegenerateFrameMotion}
              generatingFrameIds={generatingFrameIds}
              generatingFrameVideoIds={generatingFrameVideoIds}
              generatingFrameMotionIds={generatingFrameMotionIds}
              showFrameActions={phase.showFrameActions}
              showFrameMotion={phase.showFrameMotion}
              showFrameVideo={phase.showFrameVideo}
              defaultVideoModel={video?.series?.videoModel || undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function PreProductionReview({ video, approving, onApprove }: { video: VideoDetail; approving: boolean; onApprove: (endpoint: string) => void }) {
  return (
    <div className="space-y-4">
      <StatusBanner color="emerald">
        Review the audio durations, visual style, and frame breakdown below.
        When you&apos;re happy, approve to start image generation.
      </StatusBanner>

      {video.config?.visualStyleGuide && (() => {
        const sg = video.config.visualStyleGuide;
        return (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Visual Style Guide
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-gray-500">Medium</span><p className="text-gray-200 mt-0.5">{sg.global.medium}</p></div>
                <div><span className="text-gray-500">Camera</span><p className="text-gray-200 mt-0.5">{sg.global.cameraPhysics}</p></div>
                <div><span className="text-gray-500">Lighting</span><p className="text-gray-200 mt-0.5">{sg.global.defaultLighting}</p></div>
                <div><span className="text-gray-500">Material</span><p className="text-gray-200 mt-0.5">{sg.global.materialLanguage}</p></div>
                <div className="col-span-2">
                  <span className="text-gray-500">Color Palette</span>
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {sg.global.colorPalette.map((c, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="w-3 h-3 rounded-sm border border-white/10 inline-block" style={{ backgroundColor: c }} />
                        <span className="text-gray-400">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {video.config?.continuityNotes && (() => {
        const cn = video.config.continuityNotes;
        const hasChars = cn.characterRegistry?.length > 0;
        const hasLocs = cn.locationRegistry?.length > 0;
        if (!hasChars && !hasLocs) return null;
        return (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                Continuity Notes
              </h3>
              {hasChars && cn.characterRegistry.map((ch, i) => (
                <div key={i} className="text-xs bg-white/5 rounded-lg p-2.5 mb-1.5">
                  <span className="text-white font-medium">{ch.canonicalName}</span>
                  {ch.aliases.length > 0 && <span className="text-gray-500 ml-1.5">({ch.aliases.join(", ")})</span>}
                  <div className="text-gray-400 mt-1">
                    {ch.appearance.clothing}{ch.appearance.hair ? ` · ${ch.appearance.hair}` : ""}{ch.appearance.distinguishingFeatures ? ` · ${ch.appearance.distinguishingFeatures}` : ""}
                  </div>
                </div>
              ))}
              {hasLocs && cn.locationRegistry.map((loc, i) => (
                <div key={i} className="text-xs bg-white/5 rounded-lg p-2.5 mb-1.5">
                  <span className="text-white font-medium">{loc.canonicalName}</span>
                  <div className="text-gray-400 mt-1">{loc.description} · {loc.timeOfDay}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {video.config?.frameBreakdown && (() => {
        const fb = video.config.frameBreakdown;
        return (
          <Card>
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Frame Breakdown
              </h3>
              <div className="space-y-3">
                {fb.scenes.map((s, si) => (
                  <div key={si}>
                    <span className="text-xs text-gray-500 uppercase tracking-wider">Scene {si + 1} — {s.frames.length} frame{s.frames.length !== 1 ? "s" : ""}</span>
                    <div className="mt-1 grid gap-1.5">
                      {s.frames.map((f, fi) => (
                        <div key={fi} className="flex items-center gap-3 text-xs bg-white/5 rounded-lg px-3 py-2">
                          <span className="text-gray-500 w-4 text-right shrink-0">{fi + 1}</span>
                          <span className="text-gray-200 font-medium w-12 shrink-0">{f.clipDuration}s</span>
                          <span className="text-emerald-400/80 w-20 shrink-0 capitalize">{f.shotType.replace("-", " ")}</span>
                          <span className="text-violet-400/80 w-16 shrink-0 capitalize">{f.motionPolicy}</span>
                          <span className="text-gray-400 truncate">{f.subjectFocus}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <div className="flex justify-center">
        <Button variant="primary" loading={approving} onClick={() => onApprove("approve-pre-production")}>
          Approve Pre-Production &amp; Generate Images
        </Button>
      </div>
    </div>
  );
}
