"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_MODELS } from "@/lib/constants";
import { SceneRefTextarea } from "./scene-ref-textarea";
import type { VideoDetail, Scene } from "../types";
import type { VideoPhase, StudioPhaseId } from "../hooks/use-video-phase";

export function InspectorPanel({
  video,
  phase,
  editingScene,
  scenes,
  onCloseScene,
  onSubmitPrompt,
  onUndo,
  onUploadImage,
  onSelectMedia,
  regenerating,
  undoing,
  downloadUrl,
  downloading,
  onDownload,
}: {
  video: VideoDetail | null;
  phase: VideoPhase;
  editingScene: Scene | null;
  scenes: Scene[];
  onCloseScene: () => void;
  onSubmitPrompt: (prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[], modelOverride?: string) => void;
  onUndo: (() => void) | null;
  onUploadImage: (file: File) => void;
  onSelectMedia: (sceneId: string, mediaId: string) => void;
  regenerating: boolean;
  undoing: boolean;
  downloadUrl: string | null;
  downloading: boolean;
  onDownload: () => void;
}) {
  const currentPhase = phase.phases.find((p) => p.id === phase.activePhaseId);
  const imageModel = video?.series?.imageModel || "dall-e-3";

  return (
    <aside className="w-72 shrink-0 border-l border-white/5 bg-black/30 flex flex-col overflow-hidden">
      {/* ── Persistent header ── */}
      <div className="px-4 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
            {editingScene ? `Scene ${scenes.findIndex((s) => s.id === editingScene.id) + 1}` : "Project"}
          </span>
          <div className="flex items-center gap-2">
            {currentPhase && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
                currentPhase.status === "processing" ? "bg-violet-500/20 text-violet-400" :
                currentPhase.status === "review" ? "bg-amber-500/20 text-amber-400" :
                currentPhase.status === "done" ? "bg-emerald-500/20 text-emerald-400" :
                "bg-white/5 text-gray-600"
              }`}>
                {currentPhase.label}
              </span>
            )}
            {editingScene && (
              <button onClick={onCloseScene} className="text-gray-600 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <InfoRow label="Image" value={imageModel} />
          <InfoRow label="Video" value={video?.series?.videoModel || "—"} />
          <InfoRow label="Size" value={video?.series?.videoSize || "9:16"} />
        </div>
      </div>

      {/* ── Contextual body ── */}
      <div className="flex-1 overflow-y-auto">
        {editingScene ? (
          <SceneEditor
            scene={editingScene}
            scenes={scenes}
            imageModel={imageModel}
            onSubmit={onSubmitPrompt}
            onUndo={onUndo}
            onUploadImage={onUploadImage}
            onSelectMedia={onSelectMedia}
            regenerating={regenerating}
            undoing={undoing}
          />
        ) : (
          <DefaultInspectorBody
            video={video}
            phase={phase}
            currentPhase={currentPhase ?? null}
            downloadUrl={downloadUrl}
            downloading={downloading}
            onDownload={onDownload}
          />
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 py-2.5 border-t border-white/5 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-600 truncate">{video?.series?.niche}</span>
          <span className="text-[10px] text-gray-700">·</span>
          <span className="text-[10px] text-gray-600 truncate">{video?.series?.name}</span>
        </div>
      </div>
    </aside>
  );
}

// ── Scene editor (replaces PromptEditModal) ──

function SceneEditor({
  scene,
  scenes,
  imageModel,
  onSubmit,
  onUndo,
  onUploadImage,
  onSelectMedia,
  regenerating,
  undoing,
}: {
  scene: Scene;
  scenes: Scene[];
  imageModel: string;
  onSubmit: (prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[], modelOverride?: string) => void;
  onUndo: (() => void) | null;
  onUploadImage: (file: File) => void;
  onSelectMedia: (sceneId: string, mediaId: string) => void;
  regenerating: boolean;
  undoing: boolean;
}) {
  const [selectedModel, setSelectedModel] = useState(imageModel);
  const [mode, setMode] = useState<"regenerate" | "edit">("regenerate");
  const [regenPrompt, setRegenPrompt] = useState(scene.imagePrompt || scene.text);
  const [editInstruction, setEditInstruction] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canEdit = !!scene.assetUrl;

  function parseSceneRefs(text: string): string[] {
    const matches = text.matchAll(/@scene(\d+)/gi);
    const ids: string[] = [];
    for (const m of matches) {
      const idx = parseInt(m[1], 10) - 1;
      if (idx >= 0 && idx < scenes.length && scenes[idx].assetUrl) {
        ids.push(scenes[idx].id);
      }
    }
    return [...new Set(ids)];
  }

  function handleSubmit() {
    const modelOverride = selectedModel !== imageModel ? selectedModel : undefined;
    const prompt = mode === "edit" ? editInstruction : regenPrompt;
    const refs = parseSceneRefs(prompt);
    onSubmit(prompt, mode, refs, modelOverride);
  }

  return (
    <div className="p-4 space-y-4">
      {/* Image preview */}
      {scene.assetUrl && (
        <div className="relative rounded-lg overflow-hidden border border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={scene.assetUrl} alt="Current preview" className="w-full" />
          {onUndo && (
            <button
              onClick={onUndo}
              disabled={undoing}
              className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/70 backdrop-blur text-white text-[10px] font-medium hover:bg-violet-600 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {undoing ? "..." : "Undo"}
            </button>
          )}
        </div>
      )}

      {/* Version gallery */}
      {scene.media && scene.media.length > 1 && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1.5 block">
            Versions ({scene.media.length})
          </span>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {scene.media.map((m) => {
              const isCurrent = scene.assetUrl === m.url;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { if (!isCurrent) onSelectMedia(scene.id, m.id); }}
                  className={`relative shrink-0 rounded-md overflow-hidden border-2 transition-all hover:opacity-100 ${isCurrent
                    ? "border-violet-500 ring-1 ring-violet-500/30 opacity-100"
                    : "border-white/10 opacity-60 hover:border-white/30"
                  }`}
                  title={`${m.modelUsed || "Unknown"} — ${new Date(m.createdAt).toLocaleTimeString()}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="w-12 h-12 object-cover" />
                  {isCurrent && (
                    <div className="absolute inset-0 flex items-center justify-center bg-violet-500/20">
                      <svg className="w-3 h-3 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode tabs */}
      {canEdit && (
        <div className="flex gap-0.5 p-0.5 bg-white/5 rounded-lg">
          <button
            onClick={() => setMode("regenerate")}
            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${mode === "regenerate" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Regenerate
          </button>
          <button
            onClick={() => setMode("edit")}
            className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors ${mode === "edit" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
          >
            Edit
          </button>
        </div>
      )}

      {/* Model selector */}
      <div>
        <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1.5 block">Model</span>
        <div className="flex gap-1 flex-wrap">
          {IMAGE_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setSelectedModel(m.id);
                if (mode === "edit" && !scene.assetUrl) setMode("regenerate");
              }}
              className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${selectedModel === m.id
                ? "bg-violet-600 text-white"
                : "bg-white/5 border border-white/10 text-gray-500 hover:text-white hover:border-white/20"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {selectedModel !== imageModel && (
          <p className="text-[9px] text-amber-400/80 mt-1">
            Overriding default ({IMAGE_MODELS.find((m) => m.id === imageModel)?.label || imageModel})
          </p>
        )}
      </div>

      {/* Prompt */}
      {mode === "regenerate" && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1.5 block">Prompt</span>
          <SceneRefTextarea
            value={regenPrompt}
            onChange={setRegenPrompt}
            scenes={scenes}
            currentSceneId={scene.id}
            rows={5}
            placeholder="Describe the image you want to generate..."
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px] text-gray-700">{regenPrompt.length} chars</span>
            {(selectedModel === "nano-banana-2" || selectedModel === "kling-image-v3") && (
              <span className="text-[9px] text-gray-700">@ to ref scenes</span>
            )}
          </div>
        </div>
      )}

      {mode === "edit" && (
        <div>
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1.5 block">Edit Instruction</span>
          <SceneRefTextarea
            value={editInstruction}
            onChange={setEditInstruction}
            scenes={scenes}
            currentSceneId={scene.id}
            rows={3}
            placeholder='e.g. "add dramatic fog" or "change to @scene1 style"'
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px] text-gray-700">{editInstruction.length} chars</span>
            <span className="text-[9px] text-gray-700">@ to ref scenes</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUploadImage(file);
          e.target.value = "";
        }}
      />

      <div className="space-y-2">
        <Button
          variant="primary"
          size="sm"
          loading={regenerating}
          onClick={handleSubmit}
          disabled={mode === "edit" && !editInstruction.trim()}
          className="w-full"
        >
          {mode === "edit" ? "Edit Image" : (scene.assetUrl ? "Regenerate" : "Generate")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          Upload Image
        </Button>
      </div>

      {/* Scene narration preview */}
      <div className="pt-3 border-t border-white/5">
        <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1 block">Narration</span>
        <p className="text-xs text-gray-500 leading-relaxed">{scene.text}</p>
      </div>

      {scene.directorNote && (
        <div className="pt-2 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-1 block">Director&apos;s Note</span>
          <p className="text-xs text-amber-400/50 leading-relaxed">{scene.directorNote}</p>
        </div>
      )}
    </div>
  );
}

// ── Default inspector body (nothing selected) ──

function DefaultInspectorBody({
  video,
  phase,
  currentPhase,
  downloadUrl,
  downloading,
  onDownload,
}: {
  video: VideoDetail | null;
  phase: VideoPhase;
  currentPhase: { id: StudioPhaseId; label: string; status: string } | null;
  downloadUrl: string | null;
  downloading: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="p-4 space-y-4">
      {/* Processing activity */}
      {phase.isProcessing && (
        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Activity</span>
          <div className="flex items-center gap-2 text-xs text-violet-400">
            <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full shrink-0" />
            <span>{phase.processingMessage}</span>
          </div>
        </div>
      )}

      {/* Completed — download */}
      {video?.status === "COMPLETED" && (
        <div className="space-y-3">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Export</span>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-emerald-300 font-medium">Video Ready</span>
            </div>
            <Button size="sm" loading={downloading} onClick={onDownload} className="w-full">
              Download MP4
            </Button>
          </div>
        </div>
      )}

      {/* Phase description */}
      {!phase.isProcessing && (
        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">
            {currentPhase?.label || "Details"}
          </span>
          <p className="text-xs text-gray-500 leading-relaxed">
            {phase.headerDescription}
          </p>
        </div>
      )}

      {/* Creative brief */}
      {video?.config?.creativeBrief && (
        <div className="space-y-1.5 pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Brief</span>
          <p className="text-xs text-gray-400 leading-relaxed">{video.config.creativeBrief.concept}</p>
          {(video.config.creativeBrief.tone || video.config.creativeBrief.visualMood) && (
            <div className="flex gap-1.5 flex-wrap">
              {video.config.creativeBrief.tone && (
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-400">{video.config.creativeBrief.tone}</span>
              )}
              {video.config.creativeBrief.visualMood && (
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-400">{video.config.creativeBrief.visualMood}</span>
              )}
              {video.config.creativeBrief.targetAudience && (
                <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-400">{video.config.creativeBrief.targetAudience}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Visual style */}
      {video?.config?.visualStyleGuide && (
        <div className="space-y-1.5 pt-3 border-t border-white/5">
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Visual Style</span>
          <InfoRow label="Medium" value={video.config.visualStyleGuide.global.medium} />
          <InfoRow label="Camera" value={video.config.visualStyleGuide.global.cameraPhysics} />
          <InfoRow label="Lighting" value={video.config.visualStyleGuide.global.defaultLighting} />
          <InfoRow label="Material" value={video.config.visualStyleGuide.global.materialLanguage} />
          {video.config.visualStyleGuide.global.colorPalette.length > 0 && (
            <div className="flex gap-1 mt-1 flex-wrap">
              {video.config.visualStyleGuide.global.colorPalette.map((c, i) => (
                <span key={i} className="w-4 h-4 rounded-sm border border-white/10" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Continuity notes summary */}
      {video?.config?.continuityNotes && (() => {
        const cn = video.config.continuityNotes;
        const charCount = cn.characterRegistry?.length ?? 0;
        const locCount = cn.locationRegistry?.length ?? 0;
        if (!charCount && !locCount) return null;
        return (
          <div className="space-y-1.5 pt-3 border-t border-white/5">
            <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Continuity</span>
            {charCount > 0 && (
              <div className="space-y-1">
                {cn.characterRegistry.map((ch, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400/50 shrink-0" />
                    <span className="text-[10px] text-gray-400 truncate">{ch.canonicalName}</span>
                  </div>
                ))}
              </div>
            )}
            {locCount > 0 && (
              <div className="space-y-1 mt-1">
                {cn.locationRegistry.map((loc, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400/50 shrink-0" />
                    <span className="text-[10px] text-gray-400 truncate">{loc.canonicalName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-600">{label}</span>
      <span className="text-[10px] text-gray-400 font-medium truncate ml-2 max-w-[140px]">{value}</span>
    </div>
  );
}
