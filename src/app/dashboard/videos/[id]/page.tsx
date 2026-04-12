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
import { useVideoPhase } from "./hooks/use-video-phase";
import { SortableSceneCard, PromptEditModal, ScriptChatPanel, FullStoryView } from "./components";
import type { Scene } from "./types";

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
  const {
    isStoryReview, isPreProductionReview, isImagesReview, isProductionReview,
    isScenesReview, isTTSReview, isPromptsReview, isNewMotionReview, isVideoReview,
    isImageReview, isMotionReview, isNarrationReview,
    isProcessing, hasTTSRun,
    processingMessage, headerTitle, headerDescription,
    showMotionEdit, showDirectorNote, showAudioPlayer, showDuration,
    showFrameActions, showFrameMotion, showFrameVideo,
  } = phase;

  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previousAssetUrl, setPreviousAssetUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const isMusicVideo = video?.series?.videoType === "music_video";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sync processing states
  useEffect(() => {
    const isImageGen = video?.status === "IMAGE_GENERATION";
    const isMotionGen = video?.status === "VIDEO_SCRIPT" && !isMusicVideo;
    if (isImageGen !== undefined) {
      // These are managed inside the hook but we need polling
    }
    void isMotionGen;

    if (!isProcessing) return;
    const interval = setInterval(() => loadData(), 3000);
    return () => clearInterval(interval);
  }, [video?.status, loadData, isMusicVideo, isProcessing]);

  // Keep editing scene in sync
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

  // Derived state
  const totalDuration = useMemo(() => scenes.reduce((s, sc) => s + sc.duration, 0), [scenes]);
  const allImagesGenerated = scenes.length > 0 && scenes.every((s) => s.assetUrl);
  const someImagesGenerated = scenes.some((s) => s.assetUrl);
  const allFrames = scenes.flatMap((s) => s.frames ?? []);
  const hasFrames = allFrames.length > 0;
  const allFrameImagesGenerated = hasFrames && allFrames.every((f) => f.imageUrl);
  const someFrameImagesGenerated = allFrames.some((f) => f.imageUrl);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(video?.seriesId ? `/dashboard/series/${video.seriesId}` : "/dashboard/series")}
          className="mb-4"
        >
          &larr; Back to Series
        </Button>

        <h1 className="text-2xl font-bold mb-2">{headerTitle}</h1>
        <p className="text-gray-400 text-sm">{headerDescription}</p>

        <div className="mt-3 flex items-center gap-3">
          <div onClick={handleTogglePipelineMode} className="flex items-center gap-2 cursor-pointer select-none">
            <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${video?.config?.pipelineMode === "auto" ? "bg-violet-500" : "bg-white/10"}`}>
              <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${video?.config?.pipelineMode === "auto" ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-xs text-gray-400">
              {video?.config?.pipelineMode === "auto" ? "Auto Pipeline" : "Manual Review"}
            </span>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <Card className="mb-6">
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Scenes:</span>{" "}
              <span className="text-white font-medium">{scenes.length}</span>
            </div>
            {hasTTSRun && (
              <div>
                <span className="text-gray-500">Duration:</span>{" "}
                <span className="text-white font-medium font-mono">{totalDuration.toFixed(1)}s</span>
              </div>
            )}
            {(someImagesGenerated || generatingAll) && (
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Images:</span>{" "}
                <span className="text-white font-medium">
                  {scenes.filter((s) => s.assetUrl).length}/{scenes.length}
                </span>
                {generatingAll && (
                  <div className="animate-spin w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full ml-1" />
                )}
              </div>
            )}
          </div>
          <StatsBarActions
            phase={phase}
            scenes={scenes}
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
            onGenerateMotion={handleGenerateMotion}
            onStartRendering={handleStartRendering}
            onGenerateAllImages={handleGenerateAllImages}
            onGenerateAllFrameImages={handleGenerateAllFrameImages}
            onApprove={handleApprove}
          />
        </CardContent>
      </Card>

      {/* Status banners */}
      {generatingMotion && scenes.length > 0 && (
        <StatusBanner color="violet" icon="spinner">
          Generating motion descriptions for each scene using AI vision...
        </StatusBanner>
      )}
      {isMotionReview && scenes.length > 0 && (
        <StatusBanner color="emerald">
          Review the motion descriptions below. These tell the AI video model how to animate each scene.
          Edit any descriptions, then click &quot;Generate Video&quot; when ready.
        </StatusBanner>
      )}
      {isNarrationReview && scenes.length > 0 && (
        <>
          <StatusBanner color="amber">
            Review your narration below. When you&apos;re happy with the story, generate preview images.
          </StatusBanner>
          <FullStoryView scenes={scenes} />
        </>
      )}
      {isImageReview && scenes.length > 0 && (
        <StatusBanner color="amber">
          Review preview images below. You can edit prompts and regenerate until you&apos;re happy.
          Then approve to generate motion descriptions.
        </StatusBanner>
      )}
      {!allImagesGenerated && scenes.length > 0 && !isNarrationReview && !isImageReview && !isMotionReview && !generatingMotion && (
        <StatusBanner color="amber">
          Generate preview images to see what each scene will look like before creating the video.
          You can edit prompts and regenerate until you&apos;re happy.
        </StatusBanner>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
          <p className="text-sm text-violet-300">{processingMessage}</p>
        </div>
      )}

      {/* Story review */}
      {isStoryReview && video?.script && (
        <div className="mb-6">
          <StatusBanner color="violet">
            Review the creative brief, story, scenes, and continuity notes below.
            Edit the story directly if needed. When you&apos;re happy, approve to generate audio.
          </StatusBanner>
          <Card>
            <CardContent className="p-6">
              <textarea
                value={video.script}
                onChange={(e) => setVideo((prev) => prev ? { ...prev, script: e.target.value } : prev)}
                onBlur={() => { if (video.script) handleSaveStory(video.script); }}
                rows={20}
                className="w-full bg-transparent border-none text-sm text-gray-200 resize-y focus:outline-none leading-relaxed font-mono"
                placeholder="Your story will appear here..."
              />
            </CardContent>
          </Card>
          <div className="mt-6 flex justify-center">
            <Button variant="primary" size="lg" loading={approving} onClick={() => handleApprove("approve-story")}>
              Approve Story &amp; Generate Audio
            </Button>
          </div>
        </div>
      )}

      {/* Completed video */}
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
              <Button loading={downloading} onClick={handleDownload}>Download MP4</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Phase-specific review banners */}
      {isScenesReview && scenes.length > 0 && (
        <StatusBanner color="violet">
          Review the scene breakdown below. Each scene has a title, narration text, and director&apos;s note.
          Edit any scene, then approve to generate audio.
        </StatusBanner>
      )}
      {isTTSReview && scenes.length > 0 && (
        <StatusBanner color="emerald">
          Listen to the generated audio for each scene using the play buttons.
          When you&apos;re satisfied, approve to generate image prompts.
        </StatusBanner>
      )}
      {isPromptsReview && (
        <StatusBanner color="amber">
          Review the image prompts for each frame. Edit any prompt before generating images to save on generation costs.
        </StatusBanner>
      )}
      {isNewMotionReview && (
        <StatusBanner color="emerald">
          Review the motion descriptions for each frame. These control how the AI video model animates each image.
        </StatusBanner>
      )}
      {isVideoReview && (
        <StatusBanner color="violet">
          Review the generated video clips below. Hover to preview, regenerate any clip you don&apos;t like, then approve to compose the final video.
        </StatusBanner>
      )}

      {/* Pre-Production review */}
      {isPreProductionReview && scenes.length > 0 && !isProcessing && (
        <PreProductionReview video={video} approving={approving} onApprove={handleApprove} />
      )}

      {/* Images review */}
      {isImagesReview && scenes.length > 0 && !isProcessing && (
        <div className="mb-6">
          <StatusBanner color="cyan">
            Review the generated images below. Regenerate any you don&apos;t like, then approve to generate video clips.
          </StatusBanner>
          <Card>
            <CardContent className="py-3 flex items-center justify-end gap-2">
              <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-images")}>
                Approve Images &amp; Generate Video
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Production review */}
      {isProductionReview && scenes.length > 0 && !isProcessing && (
        <div className="mb-6">
          <StatusBanner color="amber">
            Review the generated video clips below. When you&apos;re happy, approve to compose the final video.
          </StatusBanner>
          <Card>
            <CardContent className="py-3 flex items-center justify-end gap-2">
              <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-production")}>
                Approve &amp; Compose Final Video
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legacy pipeline actions */}
      {(isScenesReview || isTTSReview || isPromptsReview || isImageReview || isNewMotionReview || isVideoReview) && scenes.length > 0 && !isProcessing && (
        <div className="mb-6">
          <Card>
            <CardContent className="py-3 flex items-center justify-end gap-2">
              {isScenesReview && <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-story")}>Approve Scenes &amp; Generate Audio</Button>}
              {isTTSReview && <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-pre-production")}>Approve Audio &amp; Generate Prompts</Button>}
              {isPromptsReview && <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-pre-production")}>Approve Prompts &amp; Generate Images</Button>}
              {isImageReview && (
                <>
                  <Button variant="outline" size="sm" loading={generatingAllFrames || generatingAll} onClick={() => hasFrames ? handleGenerateAllFrameImages(true) : handleGenerateAllImages(true)}>Regenerate All Images</Button>
                  <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-production")}>Approve Images &amp; Generate Motion</Button>
                </>
              )}
              {isNewMotionReview && <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-production")}>Approve Motion &amp; Generate Video</Button>}
              {isVideoReview && <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-production")}>Approve &amp; Compose Final Video</Button>}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scene list */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {scenes.map((scene, i) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                index={i}
                isSelected={scene.id === selectedSceneId}
                onSelect={() => setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)}
                onDelete={() => { handleDeleteScene(scene.id); if (selectedSceneId === scene.id) setSelectedSceneId(null); }}
                onUpdate={(updates) => handleUpdateScene(scene.id, updates)}
                onEditPrompt={() => setEditingScene(scene)}
                onUploadImage={(file) => handleUploadImage(scene.id, file)}
                onUpdateAssetRefs={(refs) => handleUpdateAssetRefs(scene.id, refs)}
                generatingImage={generatingSceneIds.has(scene.id)}
                isMusicVideo={isMusicVideo}
                isDialogue={video?.series?.videoType === "dialogue"}
                storyAssets={video?.series?.storyAssets ?? []}
                showMotionEdit={showMotionEdit}
                showDirectorNote={showDirectorNote}
                showAudioPlayer={showAudioPlayer}
                showDuration={showDuration}
                onGenerateFrameImage={(frameId, prompt) => handleGenerateFrameImage(frameId, prompt)}
                onUpdateFramePrompt={handleUpdateFramePrompt}
                onUpdateFrameMotion={handleUpdateFrameMotion}
                onRegenerateFrameVideo={handleRegenerateFrameVideo}
                onRegenerateFrameMotion={handleRegenerateFrameMotion}
                generatingFrameIds={generatingFrameIds}
                generatingFrameVideoIds={generatingFrameVideoIds}
                generatingFrameMotionIds={generatingFrameMotionIds}
                showFrameActions={showFrameActions}
                showFrameMotion={showFrameMotion}
                showFrameVideo={showFrameVideo}
                defaultVideoModel={video?.series?.videoModel || undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {scenes.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p>No scenes to review</p>
        </div>
      )}

      {/* Bottom actions */}
      {scenes.length > 0 && !generatingMotion && (
        <div className="mt-8 flex justify-center gap-3">
          {isMotionReview ? (
            <>
              <Button variant="outline" size="lg" loading={generatingMotion} onClick={handleGenerateMotion}>Regenerate Motion</Button>
              <Button variant="primary" size="lg" loading={rendering} onClick={handleStartRendering}>Generate Video ({scenes.length} scenes)</Button>
            </>
          ) : isImageReview ? (
            <>
              <Button variant="outline" size="lg" loading={generatingAllFrames || generatingAll} onClick={() => hasFrames ? handleGenerateAllFrameImages(true) : handleGenerateAllImages(true)}>Regenerate All Images</Button>
              <Button variant="primary" size="lg" loading={approving} onClick={() => handleApprove("approve-production")}>Approve &amp; Continue</Button>
            </>
          ) : (
            <>
              {!allImagesGenerated && !allFrameImagesGenerated && (
                <Button variant="outline" size="lg" loading={generatingAll || generatingAllFrames} onClick={() => hasFrames ? handleGenerateAllFrameImages(false) : handleGenerateAllImages(false)}>
                  {(someImagesGenerated || someFrameImagesGenerated) ? "Generate Remaining" : "Generate Preview Images"}
                </Button>
              )}
              {(someImagesGenerated || someFrameImagesGenerated) && (
                <Button variant="outline" size="lg" loading={generatingAll || generatingAllFrames} onClick={() => hasFrames ? handleGenerateAllFrameImages(true) : handleGenerateAllImages(true)}>Regenerate All Images</Button>
              )}
              <Button variant="primary" size="lg" loading={rendering} onClick={handleStartRendering}>Generate Video ({scenes.length} scenes)</Button>
            </>
          )}
        </div>
      )}

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

// ── Helper components inlined (small, page-specific) ──

function StatusBanner({ color, icon, children }: { color: string; icon?: "spinner"; children: React.ReactNode }) {
  const colors: Record<string, string> = {
    violet: "border-violet-500/20 bg-violet-500/5 text-violet-300",
    emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-500/20 bg-amber-500/5 text-amber-300",
    cyan: "border-cyan-500/20 bg-cyan-500/5 text-cyan-300",
  };
  return (
    <div className={`mb-6 rounded-xl border p-4 ${colors[color] || colors.violet} ${icon === "spinner" ? "flex items-center gap-3" : ""}`}>
      {icon === "spinner" && <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full shrink-0" />}
      <p className="text-sm">{children}</p>
    </div>
  );
}

function StatsBarActions({ phase, scenes, hasFrames, allImagesGenerated, allFrameImagesGenerated, someImagesGenerated, someFrameImagesGenerated, generatingAll, generatingAllFrames, generatingMotion, rendering, approving, onGenerateMotion, onStartRendering, onGenerateAllImages, onGenerateAllFrameImages, onApprove }: {
  phase: ReturnType<typeof useVideoPhase>;
  scenes: Scene[];
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
  onGenerateMotion: () => void;
  onStartRendering: () => void;
  onGenerateAllImages: (regen: boolean) => void;
  onGenerateAllFrameImages: (regen: boolean) => void;
  onApprove: (endpoint: string) => void;
}) {
  if (phase.isMotionReview) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" loading={generatingMotion} onClick={onGenerateMotion} disabled={scenes.length === 0}>Regenerate Motion</Button>
        <Button variant="primary" size="sm" loading={rendering} onClick={onStartRendering} disabled={scenes.length === 0}>Generate Video</Button>
      </div>
    );
  }
  if (phase.isImageReview) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" loading={generatingAllFrames || generatingAll} onClick={() => hasFrames ? onGenerateAllFrameImages(true) : onGenerateAllImages(true)} disabled={scenes.length === 0}>Regenerate All Images</Button>
        <Button variant="primary" size="sm" loading={approving} onClick={() => onApprove("approve-production")} disabled={scenes.length === 0}>Approve &amp; Continue</Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {!allImagesGenerated && !allFrameImagesGenerated && (
        <Button variant="outline" size="sm" loading={generatingAll || generatingAllFrames} onClick={() => hasFrames ? onGenerateAllFrameImages(false) : onGenerateAllImages(false)} disabled={scenes.length === 0}>
          {(someImagesGenerated || someFrameImagesGenerated) ? "Generate Remaining" : "Generate Preview Images"}
        </Button>
      )}
      {(someImagesGenerated || someFrameImagesGenerated) && (
        <Button variant="outline" size="sm" loading={generatingAll || generatingAllFrames} onClick={() => hasFrames ? onGenerateAllFrameImages(true) : onGenerateAllImages(true)} disabled={scenes.length === 0}>Regenerate All Images</Button>
      )}
      <Button variant="primary" loading={rendering} onClick={onStartRendering} disabled={scenes.length === 0}>Generate Video</Button>
    </div>
  );
}

function PreProductionReview({ video, approving, onApprove }: { video: import("./types").VideoDetail | null; approving: boolean; onApprove: (endpoint: string) => void }) {
  if (!video) return null;
  return (
    <div className="mb-6">
      <StatusBanner color="emerald">
        Review the audio durations, visual style, and frame breakdown below.
        When you&apos;re happy, approve to start image generation.
      </StatusBanner>

      {video.config?.visualStyleGuide && (() => {
        const sg = video.config.visualStyleGuide;
        return (
          <Card className="mb-4">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Visual Style Guide
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
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
              {sg.promptRegions && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <span className="text-gray-500 text-xs">Prompt Regions</span>
                  <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                    {sg.promptRegions.subjectPrefix && <div><span className="text-gray-500">Subject: </span><span className="text-gray-300">{sg.promptRegions.subjectPrefix}</span></div>}
                    {sg.promptRegions.cameraPrefix && <div><span className="text-gray-500">Camera: </span><span className="text-gray-300">{sg.promptRegions.cameraPrefix}</span></div>}
                    {sg.promptRegions.lightingPrefix && <div><span className="text-gray-500">Lighting: </span><span className="text-gray-300">{sg.promptRegions.lightingPrefix}</span></div>}
                    {sg.promptRegions.backgroundPrefix && <div><span className="text-gray-500">Background: </span><span className="text-gray-300">{sg.promptRegions.backgroundPrefix}</span></div>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {video.config?.continuityNotes && (() => {
        const cn = video.config.continuityNotes;
        const hasChars = cn.characterRegistry && cn.characterRegistry.length > 0;
        const hasLocs = cn.locationRegistry && cn.locationRegistry.length > 0;
        if (!hasChars && !hasLocs) return null;
        return (
          <Card className="mb-4">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400 inline-block" />
                Continuity Notes
              </h3>
              {hasChars && (
                <div className="mb-3">
                  <span className="text-gray-500 text-xs uppercase tracking-wider">Characters</span>
                  <div className="mt-1 space-y-2">
                    {cn.characterRegistry.map((ch, i) => (
                      <div key={i} className="text-xs bg-white/5 rounded-lg p-2.5">
                        <span className="text-white font-medium">{ch.canonicalName}</span>
                        {ch.aliases.length > 0 && <span className="text-gray-500 ml-1.5">({ch.aliases.join(", ")})</span>}
                        <div className="text-gray-400 mt-1">
                          {ch.appearance.clothing && <span>{ch.appearance.clothing}</span>}
                          {ch.appearance.hair && <span> · {ch.appearance.hair}</span>}
                          {ch.appearance.distinguishingFeatures && <span> · {ch.appearance.distinguishingFeatures}</span>}
                        </div>
                        <div className="text-gray-600 mt-0.5">Scenes: {ch.presentInScenes.map(s => s + 1).join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hasLocs && (
                <div>
                  <span className="text-gray-500 text-xs uppercase tracking-wider">Locations</span>
                  <div className="mt-1 space-y-2">
                    {cn.locationRegistry.map((loc, i) => (
                      <div key={i} className="text-xs bg-white/5 rounded-lg p-2.5">
                        <span className="text-white font-medium">{loc.canonicalName}</span>
                        <div className="text-gray-400 mt-1">{loc.description} · {loc.timeOfDay} · {loc.lighting}</div>
                        <div className="text-gray-600 mt-0.5">Scenes: {loc.presentInScenes.map(s => s + 1).join(", ")}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {video.config?.frameBreakdown && (() => {
        const fb = video.config.frameBreakdown;
        return (
          <Card className="mb-4">
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
                          <span className="text-gray-200 font-medium w-16 shrink-0">{f.clipDuration}s</span>
                          <span className="text-emerald-400/80 w-24 shrink-0 capitalize">{f.shotType.replace("-", " ")}</span>
                          <span className="text-violet-400/80 w-20 shrink-0 capitalize">{f.motionPolicy}</span>
                          <span className="text-amber-400/80 w-20 shrink-0 capitalize">{f.transitionIn.replace("-", " ")}</span>
                          <span className="text-gray-400 truncate" title={f.subjectFocus}>{f.subjectFocus}</span>
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

      <Card>
        <CardContent className="py-3 flex items-center justify-end gap-2">
          <Button variant="primary" size="sm" loading={approving} onClick={() => onApprove("approve-pre-production")}>
            Approve Pre-Production &amp; Generate Images
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
