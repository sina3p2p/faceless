"use client";

import { useEffect, useState, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FrameCard } from "./frame-card";
import { AssetRefPills } from "./asset-ref-pills";
import type { Scene, StoryAssetItem, SceneUpdates } from "@/types/video-detail";

export function SortableSceneCard({
  scene,
  index,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  onEditPrompt,
  onUploadImage,
  onUpdateAssetRefs,
  generatingImage,
  isMusicVideo,
  isDialogue,
  storyAssets,
  showMotionEdit,
  showDirectorNote,
  showAudioPlayer,
  showDuration,
  onGenerateFrameImage,
  onUpdateFramePrompt,
  onUpdateFrameMotion,
  onRegenerateFrameVideo,
  onRegenerateFrameMotion,
  onSelectFrameVariant,
  generatingFrameIds,
  generatingFrameVideoIds,
  generatingFrameMotionIds,
  showFrameActions,
  showFrameMotion,
  showFrameVideo,
  defaultVideoModel,
}: {
  scene: Scene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: SceneUpdates) => void;
  onEditPrompt: () => void;
  onUploadImage: (file: File) => void;
  onUpdateAssetRefs: (refs: string[]) => void;
  generatingImage: boolean;
  isMusicVideo?: boolean;
  isDialogue?: boolean;
  storyAssets: StoryAssetItem[];
  showMotionEdit?: boolean;
  showDirectorNote?: boolean;
  showAudioPlayer?: boolean;
  showDuration?: boolean;
  onGenerateFrameImage?: (frameId: string, prompt?: string) => void;
  onUpdateFramePrompt?: (frameId: string, prompt: string) => void;
  onUpdateFrameMotion?: (frameId: string, motion: string) => void;
  onRegenerateFrameVideo?: (frameId: string, videoModel?: string) => void;
  onRegenerateFrameMotion?: (frameId: string) => void;
  onSelectFrameVariant?: (frameId: string, variantId: string, type: "image" | "video") => void;
  generatingFrameIds?: Set<string>;
  generatingFrameVideoIds?: Set<string>;
  generatingFrameMotionIds?: Set<string>;
  showFrameActions?: boolean;
  showFrameMotion?: boolean;
  showFrameVideo?: boolean;
  defaultVideoModel?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const [editing, setEditing] = useState(false);
  const [editingMotion, setEditingMotion] = useState(false);
  const [editingDirectorNote, setEditingDirectorNote] = useState(false);
  const [text, setText] = useState(scene.text);
  const [duration, setDuration] = useState(scene.duration);
  const [motionText, setMotionText] = useState(scene.visualDescription || "");
  const [noteText, setNoteText] = useState(scene.directorNote || "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setText(scene.text);
    setDuration(scene.duration);
    setMotionText(scene.visualDescription || "");
    setNoteText(scene.directorNote || "");
  }, [scene.text, scene.duration, scene.visualDescription, scene.directorNote]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleTextSave() {
    setEditing(false);
    if (text !== scene.text) {
      onUpdate({ text });
    }
  }

  function handleDurationChange(val: number) {
    const clamped = Math.max(1, Math.min(30, val));
    setDuration(clamped);
    onUpdate({ duration: clamped });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`rounded-xl border transition-all ${isSelected
        ? "border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/20"
        : "border-white/5 bg-white/2 hover:border-white/10"
        }`}
    >
      <div className="flex gap-3 p-4">
        <div
          {...attributes}
          {...listeners}
          className="flex flex-col items-center justify-center px-1 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.5" />
            <circle cx="9" cy="2" r="1.5" />
            <circle cx="3" cy="6" r="1.5" />
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="3" cy="10" r="1.5" />
            <circle cx="9" cy="10" r="1.5" />
          </svg>
        </div>

        <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center text-sm font-bold text-violet-400 shrink-0 mt-0.5">
          {index + 1}
        </div>

        <div className="flex-1 min-w-0">
          {scene.sceneTitle && (
            <div className="mb-1.5">
              <span className="text-xs font-semibold text-white/80">{scene.sceneTitle}</span>
            </div>
          )}

          {isDialogue && scene.speaker && (
            <div className="mb-1.5">
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${scene.speaker.toLowerCase() === "narrator"
                ? "bg-gray-500/20 text-gray-400"
                : "bg-violet-500/20 text-violet-400"
                }`}>
                {scene.speaker}
              </span>
            </div>
          )}

          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">
              {isMusicVideo ? scene.searchQuery || "Lyrics" : isDialogue ? "Dialogue" : "Narration"}
            </span>
            {editing ? (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleTextSave}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setText(scene.text); setEditing(false); }
                }}
                autoFocus
                rows={2}
                className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
              />
            ) : (
              <p
                className="text-sm text-gray-300 cursor-text hover:text-white transition-colors leading-relaxed mt-0.5"
                onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              >
                {scene.text}
              </p>
            )}
          </div>

          {showAudioPlayer && scene.audioUrl && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium">Audio</span>
              <audio src={scene.audioUrl} controls className="w-full mt-1 h-8" preload="none" />
            </div>
          )}

          {showDirectorNote && scene.directorNote && (
            <div className="mb-2">
              <button
                className="text-[10px] uppercase tracking-wider text-amber-600 font-medium hover:text-amber-400 transition-colors flex items-center gap-1"
                onClick={(e) => { e.stopPropagation(); setEditingDirectorNote(!editingDirectorNote); }}
              >
                Director&apos;s Note
                <svg className={`w-3 h-3 transition-transform ${editingDirectorNote ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
              {editingDirectorNote ? (
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onBlur={() => {
                    if (noteText !== (scene.directorNote || "")) {
                      onUpdate({ directorNote: noteText });
                    }
                  }}
                  rows={6}
                  className="w-full mt-1 bg-black/40 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-200/80 resize-y focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none leading-relaxed"
                />
              ) : (
                <p className="text-xs text-amber-400/50 mt-0.5 line-clamp-2 leading-relaxed cursor-pointer hover:text-amber-400/70 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setEditingDirectorNote(true); }}>
                  {scene.directorNote}
                </p>
              )}
            </div>
          )}

          {scene.imagePrompt && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Image Prompt</span>
              <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{scene.imagePrompt}</p>
            </div>
          )}
          {!scene.imagePrompt && scene.frames && scene.frames.length > 0 && (
            <div className="mb-2 space-y-2">
              {scene.frames.map((frame, fi) => (
                <FrameCard
                  key={frame.id}
                  frame={frame}
                  frameIndex={fi}
                  generating={generatingFrameIds?.has(frame.id) ?? false}
                  generatingVideo={generatingFrameVideoIds?.has(frame.id) ?? false}
                  showActions={showFrameActions ?? false}
                  showMotion={showFrameMotion ?? false}
                  showVideo={showFrameVideo ?? false}
                  onGenerateImage={onGenerateFrameImage}
                  onUpdatePrompt={onUpdateFramePrompt}
                  onUpdateMotion={onUpdateFrameMotion}
                  onRegenerateMotion={onRegenerateFrameMotion}
                  generatingMotion={generatingFrameMotionIds?.has(frame.id) ?? false}
                  onRegenerateVideo={onRegenerateFrameVideo}
                  onSelectVariant={onSelectFrameVariant}
                  defaultVideoModel={defaultVideoModel}
                />
              ))}
            </div>
          )}

          {showMotionEdit && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium">Motion Description</span>
              {editingMotion ? (
                <textarea
                  value={motionText}
                  onChange={(e) => setMotionText(e.target.value)}
                  onBlur={() => {
                    setEditingMotion(false);
                    if (motionText !== (scene.visualDescription || "")) {
                      onUpdate({ visualDescription: motionText });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setMotionText(scene.visualDescription || ""); setEditingMotion(false); }
                  }}
                  autoFocus
                  rows={3}
                  className="w-full mt-1 bg-black/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-200 resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              ) : (
                <p
                  className="text-xs text-emerald-400/70 cursor-text hover:text-emerald-300 transition-colors leading-relaxed mt-0.5"
                  onClick={(e) => { e.stopPropagation(); setEditingMotion(true); }}
                >
                  {scene.visualDescription || "Click to add motion description..."}
                </p>
              )}
            </div>
          )}

          {storyAssets.length > 0 && (
            <AssetRefPills
              assetRefs={scene.assetRefs ?? []}
              allAssets={storyAssets}
              onToggle={onUpdateAssetRefs}
            />
          )}

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

          {scene.assetUrl && (
            <div className="mt-2 relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.assetUrl}
                alt={`Scene ${index + 1}`}
                className="w-full max-w-[200px] rounded-lg border border-white/10"
              />
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="px-2 py-1 rounded-md bg-black/70 text-white text-xs hover:bg-violet-600"
                  title="Upload your own image"
                >
                  Upload
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditPrompt(); }}
                  className="px-2 py-1 rounded-md bg-black/70 text-white text-xs hover:bg-violet-600"
                >
                  Edit & Regenerate
                </button>
              </div>
            </div>
          )}

          {generatingImage && !scene.assetUrl && (
            <div className="mt-2 flex items-center gap-2 text-xs text-violet-400">
              <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full" />
              Generating image...
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            {showDuration && <span className="font-mono">{duration.toFixed(1)}s</span>}
            {!scene.assetUrl && !generatingImage && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEditPrompt(); }}
                  className="text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Edit prompt
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                  className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
                  Upload image
                </button>
              </>
            )}
            {scene.assetUrl && (
              <a
                href={scene.assetUrl}
                download={`scene_${index + 1}.${scene.assetType === "video" ? "mp4" : "jpg"}`}
                onClick={(e) => e.stopPropagation()}
                className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                {scene.assetType === "video" ? "Video" : "Image"}
              </a>
            )}
            {scene.audioUrl && (
              <a
                href={scene.audioUrl}
                download={`scene_${index + 1}_audio.mp3`}
                onClick={(e) => e.stopPropagation()}
                className="text-violet-400 hover:text-violet-300 transition-colors inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Audio
              </a>
            )}
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-8 h-8 rounded-lg bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors shrink-0"
          title="Delete scene"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>

      {isSelected && showDuration && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5 ml-14">
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 whitespace-nowrap">Duration</label>
            <input
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={duration}
              onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
              className="flex-1 accent-violet-500 h-1"
            />
            <span className="text-xs font-mono text-gray-400 w-10 text-right">
              {duration.toFixed(1)}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
