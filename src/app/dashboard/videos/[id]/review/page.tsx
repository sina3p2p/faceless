"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IMAGE_MODELS } from "@/lib/constants";

interface MediaVersion {
  id: string;
  type: string;
  url: string;
  key: string;
  prompt: string | null;
  modelUsed: string | null;
  createdAt: string;
}

interface Scene {
  id: string;
  sceneOrder: number;
  sceneTitle: string | null;
  directorNote: string | null;
  text: string;
  imagePrompt: string | null;
  visualDescription: string | null;
  searchQuery: string | null;
  speaker: string | null;
  duration: number;
  assetUrl: string | null;
  assetType: string | null;
  audioUrl: string | null;
  assetRefs: string[] | null;
  media?: MediaVersion[];
}

interface StoryAssetItem {
  id: string;
  type: "character" | "location" | "prop";
  name: string;
  description: string;
  url: string;
}

interface VideoDetail {
  id: string;
  seriesId: string;
  title: string | null;
  status: string;
  duration: number | null;
  script: string | null;
  series: { name: string; niche: string; imageModel: string | null; videoType: string; storyAssets?: StoryAssetItem[] };
}

function AssetRefPills({
  assetRefs,
  allAssets,
  onToggle,
}: {
  assetRefs: string[];
  allAssets: StoryAssetItem[];
  onToggle: (refs: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (allAssets.length === 0) return null;

  const typeColors: Record<string, string> = {
    character: "bg-violet-500/20 text-violet-300 border-violet-500/30",
    location: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    prop: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  };

  const refSet = new Set(assetRefs.map((r) => r.toLowerCase()));

  return (
    <div className="relative mb-2">
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium mr-1">Assets</span>
        {assetRefs.map((ref) => {
          const asset = allAssets.find((a) => a.name.toLowerCase() === ref.toLowerCase());
          const color = asset ? typeColors[asset.type] || "" : "bg-white/10 text-gray-400 border-white/10";
          return (
            <span key={ref} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${color}`}>
              {ref}
            </span>
          );
        })}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/5 border border-white/10 text-gray-500 hover:text-white hover:border-white/20 transition-colors"
        >
          {assetRefs.length === 0 ? "+ Assign" : "Edit"}
        </button>
      </div>
      {open && (
        <div className="absolute z-20 top-full mt-1 left-0 w-64 bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-white/5">
            Toggle scene assets
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {allAssets.map((asset) => {
              const active = refSet.has(asset.name.toLowerCase());
              return (
                <button
                  key={asset.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newRefs = active
                      ? assetRefs.filter((r) => r.toLowerCase() !== asset.name.toLowerCase())
                      : [...assetRefs, asset.name];
                    onToggle(newRefs);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                    active ? "bg-violet-500/10" : "hover:bg-white/5"
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                    active ? "bg-violet-500 border-violet-500 text-white" : "border-white/20"
                  }`}>
                    {active && "✓"}
                  </div>
                  <span className={`text-[9px] uppercase font-bold tracking-wider ${
                    asset.type === "character" ? "text-violet-400" : asset.type === "location" ? "text-blue-400" : "text-amber-400"
                  }`}>
                    {asset.type.slice(0, 4)}
                  </span>
                  <span className="text-xs text-gray-300 truncate">{asset.name}</span>
                </button>
              );
            })}
          </div>
          <div className="px-3 py-1.5 border-t border-white/5">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="text-[10px] text-gray-500 hover:text-white transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableSceneCard({
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
}: {
  scene: Scene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: { text?: string; duration?: number; speaker?: string; visualDescription?: string; sceneTitle?: string; directorNote?: string }) => void;
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
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-violet-500 bg-violet-500/5 ring-1 ring-violet-500/20"
          : "border-white/5 bg-white/2 hover:border-white/10"
      }`}
    >
      <div className="flex gap-3 p-4">
        {/* Drag handle */}
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

        {/* Scene number */}
        <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center text-sm font-bold text-violet-400 shrink-0 mt-0.5">
          {index + 1}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Scene title */}
          {scene.sceneTitle && (
            <div className="mb-1.5">
              <span className="text-xs font-semibold text-white/80">{scene.sceneTitle}</span>
            </div>
          )}

          {/* Speaker badge for dialogue */}
          {isDialogue && scene.speaker && (
            <div className="mb-1.5">
              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                scene.speaker.toLowerCase() === "narrator"
                  ? "bg-gray-500/20 text-gray-400"
                  : "bg-violet-500/20 text-violet-400"
              }`}>
                {scene.speaker}
              </span>
            </div>
          )}

          {/* Narration / Lyrics text */}
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

          {/* Audio player */}
          {showAudioPlayer && scene.audioUrl && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium">Audio</span>
              <audio
                src={scene.audioUrl}
                controls
                className="w-full mt-1 h-8"
                preload="none"
              />
            </div>
          )}

          {/* Director note (collapsible) */}
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

          {/* Image prompt preview */}
          {scene.imagePrompt && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Image Prompt</span>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                {scene.imagePrompt}
              </p>
            </div>
          )}

          {/* Motion description (editable at REVIEW_VISUAL) */}
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

          {/* Asset ref pills */}
          {storyAssets.length > 0 && (
            <AssetRefPills
              assetRefs={scene.assetRefs ?? []}
              allAssets={storyAssets}
              onToggle={onUpdateAssetRefs}
            />
          )}

          {/* Hidden file input for image upload */}
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

          {/* Preview image */}
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
            <span className="font-mono">{duration.toFixed(1)}s</span>
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

        {/* Delete */}
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

      {/* Duration slider (shown when selected) */}
      {isSelected && (
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

function SceneRefTextarea({
  value,
  onChange,
  scenes,
  currentSceneId,
  rows,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  scenes: Scene[];
  currentSceneId: string;
  rows: number;
  placeholder: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [atIndex, setAtIndex] = useState(-1);

  const availableScenes = scenes.filter(
    (s) => s.id !== currentSceneId && s.assetUrl
  );

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    onChange(val);

    const pos = e.target.selectionStart;
    const textBefore = val.slice(0, pos);
    const lastAt = textBefore.lastIndexOf("@");

    if (lastAt !== -1) {
      const afterAt = textBefore.slice(lastAt + 1);
      if (/^(scene\d*)?$/i.test(afterAt)) {
        setAtIndex(lastAt);
        setShowDropdown(true);
        return;
      }
    }
    setShowDropdown(false);
  }

  function insertRef(sceneIndex: number) {
    const tag = `@scene${sceneIndex + 1}`;
    const before = value.slice(0, atIndex);
    const pos = textareaRef.current?.selectionStart ?? value.length;
    const textAfterAt = value.slice(atIndex, pos);
    const afterCursor = value.slice(atIndex + textAfterAt.length);
    const newValue = before + tag + " " + afterCursor;
    onChange(newValue);
    setShowDropdown(false);

    requestAnimationFrame(() => {
      const cursor = before.length + tag.length + 1;
      textareaRef.current?.setSelectionRange(cursor, cursor);
      textareaRef.current?.focus();
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onKeyDown={(e) => { if (e.key === "Escape") setShowDropdown(false); }}
        rows={rows}
        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white resize-y focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
        placeholder={placeholder}
      />
      {showDropdown && availableScenes.length > 0 && (
        <div
          className="absolute z-100 w-full bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden bottom-full mb-1"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-medium border-b border-white/5">
            Reference a scene
          </div>
          <div className="max-h-48 overflow-y-auto">
            {availableScenes.map((s) => {
              const idx = scenes.indexOf(s);
              return (
                <button
                  key={s.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertRef(idx); }}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-violet-500/10 text-left transition-colors"
                >
                  {s.assetUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.assetUrl}
                      alt=""
                      className="w-8 h-8 rounded object-cover shrink-0 border border-white/10"
                    />
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-violet-400">@scene{idx + 1}</span>
                    <p className="text-xs text-gray-400 truncate">{s.text.slice(0, 60)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PromptEditModal({
  scene,
  scenes,
  imageModel,
  videoId,
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

          {/* Previous versions gallery */}
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
                      className={`relative shrink-0 rounded-lg overflow-hidden border-2 transition-all hover:opacity-100 ${
                        isCurrent
                          ? "border-violet-500 ring-1 ring-violet-500/30 opacity-100"
                          : "border-white/10 opacity-60 hover:border-white/30"
                      }`}
                      title={`${m.modelUsed || "Unknown model"} — ${new Date(m.createdAt).toLocaleTimeString()}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.url}
                        alt=""
                        className="w-16 h-16 object-cover"
                      />
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

          {/* Tabs */}
          {canEdit && (
            <div className="flex gap-1 mb-4 p-1 bg-white/5 rounded-lg">
              <button
                onClick={() => setMode("regenerate")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "regenerate"
                    ? "bg-violet-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Regenerate
              </button>
              <button
                onClick={() => setMode("edit")}
                className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === "edit"
                    ? "bg-violet-600 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                Edit
              </button>
            </div>
          )}

          {/* Model selector */}
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      selectedModel === m.id
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

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface RefinedScene {
  sceneOrder: number;
  sceneTitle?: string;
  directorNote?: string;
  text: string;
  imagePrompt: string;
  visualDescription: string;
  searchQuery: string;
  duration: number;
}

interface FieldChange {
  field: string;
  old?: string;
  new?: string;
}

interface SceneChange {
  scene: number;
  type: "modified" | "added" | "removed";
  fields: FieldChange[];
}

function DiffBlock({ change }: { change: SceneChange }) {
  const [expanded, setExpanded] = useState(true);
  const label =
    change.type === "added" ? "Added" :
    change.type === "removed" ? "Removed" : `${change.fields.length} change${change.fields.length > 1 ? "s" : ""}`;
  const color =
    change.type === "added" ? "text-green-400" :
    change.type === "removed" ? "text-red-400" : "text-violet-300";

  return (
    <div className="rounded-lg border border-white/10 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-white/5 hover:bg-white/10 transition-colors"
      >
        <span className="text-xs font-medium text-white">Scene {change.scene}</span>
        <span className={`text-[10px] font-medium ${color}`}>{label}</span>
      </button>
      {expanded && (
        <div className="px-3 py-2 space-y-2">
          {change.fields.map((f, i) => (
            <div key={i}>
              <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{f.field}</span>
              {f.old && (
                <div className="mt-0.5 rounded bg-red-500/10 border border-red-500/20 px-2 py-1">
                  <p className="text-xs text-red-300/80 line-through break-words">{f.old.length > 150 ? f.old.slice(0, 150) + "…" : f.old}</p>
                </div>
              )}
              {f.new && (
                <div className="mt-0.5 rounded bg-green-500/10 border border-green-500/20 px-2 py-1">
                  <p className="text-xs text-green-300 break-words">{f.new.length > 150 ? f.new.slice(0, 150) + "…" : f.new}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptChatPanel({
  videoId,
  scenes,
  onApply,
  onClose,
}: {
  videoId: string;
  scenes: Scene[];
  onApply: (refined: RefinedScene[], title: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingResult, setPendingResult] = useState<{
    scenes: RefinedScene[];
    title: string;
    changes: SceneChange[];
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingResult]);

  async function handleSend() {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: ChatMsg = { role: "user", content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingResult(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/videos/${videoId}/refine-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          chatHistory: messages,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessages([...newMessages, { role: "assistant", content: `Error: ${err.error || "Something went wrong"}` }]);
        return;
      }

      const data = await res.json();
      const changes: SceneChange[] = data.changes || [];
      const changedCount = changes.length;
      const briefSummary = changedCount === 0
        ? "No changes detected."
        : `${changedCount} scene${changedCount > 1 ? "s" : ""} modified:`;

      setPendingResult({
        scenes: data.scenes,
        title: data.title,
        changes,
      });
      setMessages([...newMessages, { role: "assistant", content: briefSummary }]);
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Error: Network request failed" }]);
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!pendingResult) return;
    onApply(pendingResult.scenes, pendingResult.title);
    setPendingResult(null);
    setMessages((prev) => [...prev, { role: "assistant", content: "Changes applied to the script." }]);
  }

  return (
    <div className="fixed bottom-4 right-4 w-[440px] max-h-[75vh] bg-gray-900 border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          <h3 className="text-sm font-semibold text-white">Refine Script with AI</h3>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-gray-400 mb-3">Tell the AI how you&apos;d like to improve the script</p>
            <div className="space-y-1.5">
              {["Make the hook more dramatic", "Scene 3 is weak, make it more intense", "Change the tone to be funnier", "Add a plot twist at the end"].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="block w-full text-left text-xs text-gray-500 hover:text-violet-400 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  &quot;{s}&quot;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-violet-600 text-white"
                : "bg-white/5 border border-white/10 text-gray-300"
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {pendingResult && pendingResult.changes.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {pendingResult.changes.map((ch, i) => (
                <DiffBlock key={i} change={ch} />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                className="flex-1 px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-semibold hover:bg-green-500 transition-colors"
              >
                Apply {pendingResult.changes.length} Change{pendingResult.changes.length > 1 ? "s" : ""}
              </button>
              <button
                onClick={() => setPendingResult(null)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-400 text-xs font-medium hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="e.g. &quot;Make scene 2 more dramatic&quot;"
            className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="px-3 py-2 rounded-xl bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [editingScene, setEditingScene] = useState<Scene | null>(null);
  const [previousAssetUrl, setPreviousAssetUrl] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generatingMotion, setGeneratingMotion] = useState(false);
  const [generatingSceneIds, setGeneratingSceneIds] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = useCallback(async () => {
    try {
      const [scenesRes, videoRes] = await Promise.all([
        fetch(`/api/videos/${id}/scenes`),
        fetch(`/api/videos/${id}`),
      ]);

      if (scenesRes.ok) {
        const data = await scenesRes.json();
        setScenes(
          data.scenes.map((s: Scene) => ({
            ...s,
            duration: s.duration ?? 5,
          }))
        );
      }

      if (videoRes.ok) {
        const data = await videoRes.json();
        setVideo(data);
      }

      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(scenes, oldIndex, newIndex).map((s, i) => ({
      ...s,
      sceneOrder: i,
    }));
    setScenes(reordered);

    fetch(`/api/videos/${id}/scenes/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sceneIds: reordered.map((s) => s.id) }),
    });
  }

  function handleUpdateScene(
    sceneId: string,
    updates: { text?: string; duration?: number; speaker?: string; visualDescription?: string; sceneTitle?: string; directorNote?: string }
  ) {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, ...updates } : s))
    );

    fetch(`/api/videos/${id}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  function handleUpdateAssetRefs(sceneId: string, refs: string[]) {
    setScenes((prev) =>
      prev.map((s) => (s.id === sceneId ? { ...s, assetRefs: refs } : s))
    );
    fetch(`/api/videos/${id}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetRefs: refs }),
    });
  }

  function handleDeleteScene(sceneId: string) {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
    fetch(`/api/videos/${id}/scenes/${sceneId}`, { method: "DELETE" });
  }

  async function handleUploadImage(sceneId: string, file: File) {
    setGeneratingSceneIds((prev) => new Set(prev).add(sceneId));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload-temp", { method: "POST", body: fd });
      if (!uploadRes.ok) return;
      const { url: key } = await uploadRes.json();

      await fetch(`/api/videos/${id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetUrl: key, imageUrl: key, assetType: "image" }),
      });

      await loadData();
    } finally {
      setGeneratingSceneIds((prev) => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  }

  async function generateImageForScene(
    sceneId: string,
    promptOverride?: string,
    mode: "regenerate" | "edit" = "regenerate",
    referenceSceneIds?: string[],
    modelOverride?: string
  ) {
    setGeneratingSceneIds((prev) => new Set(prev).add(sceneId));
    try {
      const body: Record<string, unknown> = { mode };
      if (promptOverride) body.imagePrompt = promptOverride;
      if (referenceSceneIds && referenceSceneIds.length > 0) body.referenceSceneIds = referenceSceneIds;
      if (modelOverride) body.imageModel = modelOverride;

      const res = await fetch(`/api/videos/${id}/scenes/${sceneId}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        await loadData();
      }
    } finally {
      setGeneratingSceneIds((prev) => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  }

  async function updateVideoStatus(status: string) {
    await fetch(`/api/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setVideo((prev) => prev ? { ...prev, status } : prev);
  }

  async function handleGenerateAllImages(regenerateExisting = false) {
    setGeneratingAll(true);
    try {
      await fetch(`/api/videos/${id}/generate-images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateExisting }),
      });
      setVideo((prev) => prev ? { ...prev, status: "IMAGE_GENERATION" } : prev);
    } catch {
      setGeneratingAll(false);
    }
  }

  // Music-specific: generate song from lyrics
  const [generatingSong, setGeneratingSong] = useState(false);
  async function handleGenerateSong() {
    setGeneratingSong(true);
    try {
      const res = await fetch(`/api/videos/${id}/generate-song`, { method: "POST" });
      if (res.ok) {
        setVideo((prev) => prev ? { ...prev, status: "MUSIC_GENERATION" } : prev);
        router.push(`/dashboard/videos/${id}`);
      }
    } finally {
      setGeneratingSong(false);
    }
  }

  const isMusicLyricsReview = video?.status === "REVIEW_MUSIC_SCRIPT";
  const isVisualReview = video?.status === "REVIEW_VISUAL";
  const isMusicVideo = video?.series?.videoType === "music_video";
  const isMotionReview = isVisualReview && !isMusicVideo;
  const isImageReview = video?.status === "IMAGE_REVIEW";
  const isNarrationReview = video?.status === "REVIEW_SCRIPT" && !isMusicVideo;

  // New pipeline statuses
  const isStoryReview = video?.status === "REVIEW_STORY";
  const isScenesReview = video?.status === "REVIEW_SCENES";
  const isTTSReview = video?.status === "TTS_REVIEW";
  const isPromptsReview = video?.status === "REVIEW_PROMPTS";
  const isNewMotionReview = video?.status === "REVIEW_MOTION";
  const isProcessing = ["STORY", "SCENE_SPLIT", "TTS_GENERATION", "PROMPT_GENERATION", "MOTION_GENERATION", "IMAGE_GENERATION", "VIDEO_GENERATION", "RENDERING"].includes(video?.status || "");

  // Poll for any processing status
  useEffect(() => {
    const isImageGen = video?.status === "IMAGE_GENERATION";
    const isMotionGen = video?.status === "VIDEO_SCRIPT" && !isMusicVideo;
    setGeneratingAll(isImageGen ?? false);
    setGeneratingMotion(isMotionGen ?? false);

    if (!isProcessing) return;

    const interval = setInterval(async () => {
      await loadData();
    }, 3000);

    return () => clearInterval(interval);
  }, [video?.status, loadData, isMusicVideo, isProcessing]);

  useEffect(() => {
    if (editingScene) {
      const fresh = scenes.find((s) => s.id === editingScene.id);
      if (fresh && fresh.assetUrl !== editingScene.assetUrl) {
        setEditingScene({ ...fresh });
      }
    }
  }, [scenes, editingScene]);

  async function handleGenerateImage(prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[], modelOverride?: string) {
    if (!editingScene) return;
    setPreviousAssetUrl(editingScene.assetUrl);
    setRegenerating(true);
    await generateImageForScene(editingScene.id, prompt, mode, referenceSceneIds, modelOverride);
    setRegenerating(false);
  }

  async function handleSelectMedia(sceneId: string, mediaId: string) {
    try {
      const res = await fetch(`/api/videos/${id}/scenes/${sceneId}/select-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId }),
      });
      if (res.ok) {
        await loadData();
      }
    } catch {
      console.error("Failed to select media version");
    }
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

  async function handleGenerateMotion() {
    setGeneratingMotion(true);
    try {
      await fetch(`/api/videos/${id}/generate-motion`, { method: "POST" });
      setVideo((prev) => prev ? { ...prev, status: "VIDEO_SCRIPT" } : prev);
    } catch {
      setGeneratingMotion(false);
    }
  }

  // New pipeline approve handlers
  const [approving, setApproving] = useState(false);

  async function handleApprove(endpoint: string) {
    setApproving(true);
    try {
      await fetch(`/api/videos/${id}/${endpoint}`, { method: "POST" });
      await loadData();
    } catch { /* retry */ }
    setApproving(false);
  }

  async function handleSaveStory(updatedMarkdown: string) {
    await fetch(`/api/videos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ script: updatedMarkdown }),
    });
    setVideo((prev) => prev ? { ...prev, script: updatedMarkdown } : prev);
  }

  async function handleStartRendering() {
    setRendering(true);
    try {
      const res = await fetch(`/api/videos/${id}/render`, { method: "POST" });
      if (res.ok) {
        router.push(`/dashboard/videos/${id}`);
      }
    } catch {}
    setRendering(false);
  }

  async function handleApplyRefinedScript(refined: RefinedScene[], title: string) {
    const updatedScenes = [...scenes];

    for (let i = 0; i < refined.length; i++) {
      const r = refined[i];
      const existing = updatedScenes[i];

      if (existing) {
        const updates: Record<string, unknown> = {};
        if (r.text !== existing.text) updates.text = r.text;
        if (r.sceneTitle && r.sceneTitle !== (existing.sceneTitle || "")) updates.sceneTitle = r.sceneTitle;
        if (r.directorNote && r.directorNote !== (existing.directorNote || "")) updates.directorNote = r.directorNote;
        if (r.imagePrompt !== (existing.imagePrompt || "")) updates.imagePrompt = r.imagePrompt;
        if (r.visualDescription !== (existing.visualDescription || "")) updates.visualDescription = r.visualDescription;
        if (r.searchQuery !== (existing.searchQuery || "")) updates.searchQuery = r.searchQuery;
        if (r.duration !== existing.duration) updates.duration = r.duration;

        if (Object.keys(updates).length > 0) {
          await fetch(`/api/videos/${id}/scenes/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
        }
      }
    }

    if (title && title !== video?.title) {
      await fetch(`/api/videos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    }

    await loadData();
  }

  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);
  const allImagesGenerated = scenes.length > 0 && scenes.every((s) => s.assetUrl);
  const someImagesGenerated = scenes.some((s) => s.assetUrl);

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

        <h1 className="text-2xl font-bold mb-2">
          {video?.title ?? (
            isStoryReview ? "Review Story" :
            isScenesReview ? "Review Scenes" :
            isTTSReview ? "Review Audio" :
            isPromptsReview ? "Review Image Prompts" :
            isNewMotionReview ? "Review Motion" :
            isMusicLyricsReview ? "Review Lyrics" :
            isMotionReview ? "Review Motion" :
            isVisualReview ? "Review Visuals" :
            isMusicVideo ? "Review Song" :
            isProcessing ? "Processing..." :
            "Review"
          )}
        </h1>
        <p className="text-gray-400 text-sm">
          {isStoryReview
            ? "Review and edit your story, then approve to split into scenes."
            : isScenesReview
            ? "Review the scene breakdown and director's notes, then generate audio."
            : isTTSReview
            ? "Listen to the generated audio for each scene, then generate image prompts."
            : isPromptsReview
            ? "Review the image prompts before generating images. Edit any prompts to refine the visuals."
            : isNewMotionReview
            ? "Review the motion descriptions for each frame, then generate the final video."
            : isProcessing
            ? "Your video is being processed..."
            : isMusicLyricsReview
            ? "Review and edit your song lyrics, then generate the song."
            : isImageReview
            ? "Review generated images, then approve to generate motion."
            : "Review your content and approve to continue."}
        </p>
      </div>

      {/* Stats bar */}
      <Card className="mb-6">
        <CardContent className="py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-sm">
            <div>
              <span className="text-gray-500">Scenes:</span>{" "}
              <span className="text-white font-medium">{scenes.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Duration:</span>{" "}
              <span className="text-white font-medium font-mono">{totalDuration.toFixed(1)}s</span>
            </div>
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
          <div className="flex items-center gap-2">
            {isMusicLyricsReview ? (
              <Button
                variant="primary"
                size="sm"
                loading={generatingSong}
                onClick={handleGenerateSong}
                disabled={scenes.length === 0}
              >
                Generate Song
              </Button>
            ) : isMotionReview ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  loading={generatingMotion}
                  onClick={handleGenerateMotion}
                  disabled={scenes.length === 0}
                >
                  Regenerate Motion
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={rendering}
                  onClick={handleStartRendering}
                  disabled={scenes.length === 0}
                >
                  Generate Video
                </Button>
              </>
            ) : isImageReview && !isMusicVideo ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  loading={generatingAll}
                  onClick={() => handleGenerateAllImages(true)}
                  disabled={scenes.length === 0}
                >
                  Regenerate All Images
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={generatingMotion}
                  onClick={handleGenerateMotion}
                  disabled={scenes.length === 0}
                >
                  Approve &amp; Generate Motion
                </Button>
              </>
            ) : (
              <>
                {!allImagesGenerated && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={generatingAll}
                    onClick={() => handleGenerateAllImages(false)}
                    disabled={scenes.length === 0}
                  >
                    {someImagesGenerated ? "Generate Remaining" : "Generate Preview Images"}
                  </Button>
                )}
                {someImagesGenerated && (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={generatingAll}
                    onClick={() => handleGenerateAllImages(true)}
                    disabled={scenes.length === 0}
                  >
                    Regenerate All Images
                  </Button>
                )}
                <Button
                  variant="primary"
                  loading={rendering}
                  onClick={handleStartRendering}
                  disabled={scenes.length === 0}
                >
                  Generate Video
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {generatingMotion && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center gap-3">
          <div className="animate-spin w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full shrink-0" />
          <p className="text-sm text-violet-300">
            Generating motion descriptions for each scene using AI vision...
          </p>
        </div>
      )}

      {isMotionReview && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm text-emerald-300">
            Review the motion descriptions below. These tell the AI video model how to animate each scene.
            Edit any descriptions, then click &quot;Generate Video&quot; when ready.
          </p>
        </div>
      )}

      {isNarrationReview && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Review your narration below. When you&apos;re happy with the story, generate preview images.
          </p>
        </div>
      )}

      {isImageReview && !isMusicVideo && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Review preview images below. You can edit prompts and regenerate until you&apos;re happy.
            Then approve to generate motion descriptions.
          </p>
        </div>
      )}

      {!allImagesGenerated && scenes.length > 0 && !isMusicLyricsReview && !isNarrationReview && !isImageReview && !isMotionReview && !generatingMotion && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Generate preview images to see what each scene will look like before creating the video.
            You can edit prompts and regenerate until you&apos;re happy.
          </p>
        </div>
      )}

      {isMusicLyricsReview && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-sm text-violet-300">
            Edit the lyrics and section details below. When you&apos;re happy, click &quot;Generate Song&quot; to create the music.
          </p>
        </div>
      )}

      {/* Processing indicator for new pipeline */}
      {isProcessing && (
        <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-8 flex flex-col items-center gap-3">
          <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
          <p className="text-sm text-violet-300">
            {video?.status === "STORY" && "Writing your story..."}
            {video?.status === "SCENE_SPLIT" && "Splitting story into scenes..."}
            {video?.status === "TTS_GENERATION" && "Generating audio narration..."}
            {video?.status === "PROMPT_GENERATION" && "Creating image prompts for each frame..."}
            {video?.status === "MOTION_GENERATION" && "Designing motion for each frame..."}
            {video?.status === "IMAGE_GENERATION" && "Generating images..."}
            {video?.status === "VIDEO_GENERATION" && "Generating video clips..."}
            {video?.status === "RENDERING" && "Composing final video..."}
          </p>
        </div>
      )}

      {/* REVIEW_STORY: Full story editor */}
      {isStoryReview && video?.script && (
        <div className="mb-6">
          <div className="mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
            <p className="text-sm text-violet-300">
              Read your story below. Edit it directly, or use the AI chat to refine it.
              When you&apos;re happy, approve to split into scenes.
            </p>
          </div>
          <Card>
            <CardContent className="p-6">
              <textarea
                value={video.script}
                onChange={(e) => {
                  const updated = e.target.value;
                  setVideo((prev) => prev ? { ...prev, script: updated } : prev);
                }}
                onBlur={() => {
                  if (video.script) handleSaveStory(video.script);
                }}
                rows={20}
                className="w-full bg-transparent border-none text-sm text-gray-200 resize-y focus:outline-none leading-relaxed font-mono"
                placeholder="Your story will appear here..."
              />
            </CardContent>
          </Card>
          <div className="mt-6 flex justify-center">
            <Button
              variant="primary"
              size="lg"
              loading={approving}
              onClick={() => handleApprove("approve-story")}
            >
              Approve Story &amp; Split into Scenes
            </Button>
          </div>
        </div>
      )}

      {/* REVIEW_SCENES banner */}
      {isScenesReview && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <p className="text-sm text-violet-300">
            Review the scene breakdown below. Each scene has a title, narration text, and director&apos;s note.
            Edit any scene, then approve to generate audio.
          </p>
        </div>
      )}

      {/* TTS_REVIEW banner */}
      {isTTSReview && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm text-emerald-300">
            Listen to the generated audio for each scene using the play buttons.
            When you&apos;re satisfied, approve to generate image prompts.
          </p>
        </div>
      )}

      {/* REVIEW_PROMPTS / IMAGE_REVIEW / REVIEW_MOTION banners */}
      {isPromptsReview && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Review the image prompts for each frame. Edit any prompt before generating images to save on generation costs.
          </p>
        </div>
      )}

      {isNewMotionReview && (
        <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm text-emerald-300">
            Review the motion descriptions for each frame. These control how the AI video model animates each image.
          </p>
        </div>
      )}

      {/* New pipeline bottom actions */}
      {(isScenesReview || isTTSReview || isPromptsReview || isNewMotionReview) && scenes.length > 0 && !isProcessing && (
        <div className="mb-6">
          <Card>
            <CardContent className="py-3 flex items-center justify-end gap-2">
              {isScenesReview && (
                <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-scenes")}>
                  Approve Scenes &amp; Generate Audio
                </Button>
              )}
              {isTTSReview && (
                <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-tts")}>
                  Approve Audio &amp; Generate Prompts
                </Button>
              )}
              {isPromptsReview && (
                <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-prompts")}>
                  Approve Prompts &amp; Generate Images
                </Button>
              )}
              {isImageReview && !isMusicVideo && (
                <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-images")}>
                  Approve Images &amp; Generate Motion
                </Button>
              )}
              {isNewMotionReview && (
                <Button variant="primary" size="sm" loading={approving} onClick={() => handleApprove("approve-motion")}>
                  Approve Motion &amp; Generate Video
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scene list */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={scenes.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {scenes.map((scene, i) => (
              <SortableSceneCard
                key={scene.id}
                scene={scene}
                index={i}
                isSelected={scene.id === selectedSceneId}
                onSelect={() =>
                  setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)
                }
                onDelete={() => handleDeleteScene(scene.id)}
                onUpdate={(updates) => handleUpdateScene(scene.id, updates)}
                onEditPrompt={() => setEditingScene(scene)}
                onUploadImage={(file) => handleUploadImage(scene.id, file)}
                onUpdateAssetRefs={(refs) => handleUpdateAssetRefs(scene.id, refs)}
                generatingImage={generatingSceneIds.has(scene.id)}
                isMusicVideo={isMusicVideo}
                isDialogue={video?.series?.videoType === "dialogue"}
                storyAssets={video?.series?.storyAssets ?? []}
                showMotionEdit={isMotionReview || isNewMotionReview}
                showDirectorNote={true}
                showAudioPlayer={isTTSReview || isPromptsReview || isNewMotionReview}
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

      {/* Bottom action */}
      {scenes.length > 0 && !generatingMotion && (
        <div className="mt-8 flex justify-center gap-3">
          {isMusicLyricsReview ? (
            <Button
              variant="primary"
              size="lg"
              loading={generatingSong}
              onClick={handleGenerateSong}
            >
              Generate Song ({scenes.length} sections, ~{totalDuration.toFixed(0)}s)
            </Button>
          ) : isMotionReview ? (
            <>
              <Button
                variant="outline"
                size="lg"
                loading={generatingMotion}
                onClick={handleGenerateMotion}
              >
                Regenerate Motion
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={rendering}
                onClick={handleStartRendering}
              >
                Generate Video ({scenes.length} scenes, {totalDuration.toFixed(0)}s)
              </Button>
            </>
          ) : isImageReview && !isMusicVideo ? (
            <>
              <Button
                variant="outline"
                size="lg"
                loading={generatingAll}
                onClick={() => handleGenerateAllImages(true)}
              >
                Regenerate All Images
              </Button>
              <Button
                variant="primary"
                size="lg"
                loading={generatingMotion}
                onClick={handleGenerateMotion}
              >
                Approve &amp; Generate Motion
              </Button>
            </>
          ) : (
            <>
              {!allImagesGenerated && (
                <Button
                  variant="outline"
                  size="lg"
                  loading={generatingAll}
                  onClick={() => handleGenerateAllImages(false)}
                >
                  Generate Preview Images
                </Button>
              )}
              {someImagesGenerated && (
                <Button
                  variant="outline"
                  size="lg"
                  loading={generatingAll}
                  onClick={() => handleGenerateAllImages(true)}
                >
                  Regenerate All Images
                </Button>
              )}
              <Button
                variant="primary"
                size="lg"
                loading={rendering}
                onClick={handleStartRendering}
              >
                Generate Video ({scenes.length} scenes, {totalDuration.toFixed(0)}s)
              </Button>
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

      {/* Floating chat button */}
      {!chatOpen && scenes.length > 0 && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-violet-600 text-white shadow-lg hover:bg-violet-500 transition-all hover:scale-105 z-40 flex items-center justify-center"
          title="Refine script with AI"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
        </button>
      )}

      {/* Script refinement chat panel */}
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
