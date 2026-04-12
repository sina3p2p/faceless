"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { IMAGE_MODELS } from "@/lib/constants";
import { SceneRefTextarea } from "./scene-ref-textarea";
import type { Scene } from "../types";

export function PromptEditModal({
  scene,
  scenes,
  imageModel,
  onClose,
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
  videoId: string;
  onClose: () => void;
  onSubmit: (prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[], modelOverride?: string) => void;
  onUndo: (() => void) | null;
  onUploadImage: (file: File) => void;
  onSelectMedia: (sceneId: string, mediaId: string) => void;
  regenerating: boolean;
  undoing: boolean;
}) {
  const [selectedModel, setSelectedModel] = useState(imageModel);
  const canEdit = !!scene.assetUrl;
  const modalFileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"regenerate" | "edit">("regenerate");
  const [regenPrompt, setRegenPrompt] = useState(scene.imagePrompt || scene.text);
  const [editInstruction, setEditInstruction] = useState("");

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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4">
            {mode === "edit" ? "Edit Image" : (scene.assetUrl ? "Regenerate Image" : "Generate Image")}
          </h3>

          {scene.assetUrl && (
            <div className="mb-4 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.assetUrl}
                alt="Current preview"
                className="w-full rounded-lg border border-white/10"
              />
              {onUndo && (
                <button
                  onClick={onUndo}
                  disabled={undoing}
                  className="absolute top-2 left-2 px-2.5 py-1.5 rounded-lg bg-black/70 backdrop-blur text-white text-xs font-medium hover:bg-violet-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                  </svg>
                  {undoing ? "Undoing..." : "Undo"}
                </button>
              )}
            </div>
          )}

          {scene.media && scene.media.length > 1 && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                Previous versions ({scene.media.length})
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {scene.media.map((m) => {
                  const isCurrent = scene.assetUrl === m.url;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) onSelectMedia(scene.id, m.id);
                      }}
                      className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all hover:opacity-100 ${isCurrent
                        ? "border-violet-500 ring-1 ring-violet-500/30 opacity-100"
                        : "border-white/10 opacity-60 hover:border-white/30"
                      }`}
                      title={`${m.modelUsed || "Unknown model"} — ${new Date(m.createdAt).toLocaleTimeString()}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.url} alt="" className="w-16 h-16 object-cover" />
                      {isCurrent && (
                        <div className="absolute inset-0 flex items-center justify-center bg-violet-500/20">
                          <svg className="w-4 h-4 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
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

          {canEdit && (
            <div className="flex gap-1 mb-4 p-1 bg-white/5 rounded-lg">
              <button
                onClick={() => setMode("regenerate")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "regenerate" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Regenerate
              </button>
              <button
                onClick={() => setMode("edit")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === "edit" ? "bg-violet-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Edit
              </button>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Image Model</label>
            <div className="flex gap-1.5 flex-wrap">
              {IMAGE_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedModel(m.id);
                    if (mode === "edit" && !scene.assetUrl) setMode("regenerate");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedModel === m.id
                    ? "bg-violet-600 text-white"
                    : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {selectedModel !== imageModel && (
              <p className="text-[10px] text-amber-400/80 mt-1">
                Overriding series default ({IMAGE_MODELS.find((m) => m.id === imageModel)?.label || imageModel})
              </p>
            )}
          </div>

          {mode === "regenerate" && (
            <>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Image Prompt</label>
              <SceneRefTextarea
                value={regenPrompt}
                onChange={setRegenPrompt}
                scenes={scenes}
                currentSceneId={scene.id}
                rows={6}
                placeholder="Describe the image you want to generate..."
              />
              <div className="flex items-center justify-between mt-2 mb-4">
                <span className="text-xs text-gray-600">{regenPrompt.length} chars</span>
                {(selectedModel === "nano-banana-2" || selectedModel === "kling-image-v3") && (
                  <span className="text-xs text-gray-600">Type @ to reference another scene</span>
                )}
              </div>
            </>
          )}

          {mode === "edit" && (
            <>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Edit Instruction</label>
              <SceneRefTextarea
                value={editInstruction}
                onChange={setEditInstruction}
                scenes={scenes}
                currentSceneId={scene.id}
                rows={3}
                placeholder='e.g. "change the hair color to look like @scene1" or "add dramatic fog"'
              />
              <div className="flex items-center justify-between mt-2 mb-4">
                <span className="text-xs text-gray-600">{editInstruction.length} chars</span>
                <span className="text-xs text-gray-600">Type @ to reference another scene</span>
              </div>
            </>
          )}

          <input
            ref={modalFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { onUploadImage(file); onClose(); }
              e.target.value = "";
            }}
          />

          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => modalFileInputRef.current?.click()}
              className="flex-1"
            >
              Upload Image
            </Button>
            <Button
              variant="primary"
              loading={regenerating}
              onClick={handleSubmit}
              disabled={mode === "edit" && !editInstruction.trim()}
              className="flex-1"
            >
              {mode === "edit" ? "Edit Image" : (scene.assetUrl ? "Regenerate Image" : "Generate Image")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
