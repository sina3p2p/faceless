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

interface Scene {
  id: string;
  sceneOrder: number;
  text: string;
  imagePrompt: string | null;
  visualDescription: string | null;
  searchQuery: string | null;
  duration: number;
  assetUrl: string | null;
  assetType: string | null;
  audioUrl: string | null;
}

interface VideoDetail {
  id: string;
  seriesId: string;
  title: string | null;
  status: string;
  duration: number | null;
  series: { name: string; niche: string; imageModel: string | null; videoType: string };
}

function SortableSceneCard({
  scene,
  index,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
  onEditPrompt,
  generatingImage,
  isMusicVideo,
}: {
  scene: Scene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: { text?: string; duration?: number }) => void;
  onEditPrompt: () => void;
  generatingImage: boolean;
  isMusicVideo?: boolean;
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
  const [text, setText] = useState(scene.text);
  const [duration, setDuration] = useState(scene.duration);

  useEffect(() => {
    setText(scene.text);
    setDuration(scene.duration);
  }, [scene.text, scene.duration]);

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
          {/* Narration / Lyrics text */}
          <div className="mb-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">
              {isMusicVideo ? scene.searchQuery || "Lyrics" : "Narration"}
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

          {/* Image prompt preview */}
          {scene.imagePrompt && (
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-600 font-medium">Image Prompt</span>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">
                {scene.imagePrompt}
              </p>
            </div>
          )}

          {/* Preview image */}
          {scene.assetUrl && (
            <div className="mt-2 relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={scene.assetUrl}
                alt={`Scene ${index + 1}`}
                className="w-full max-w-[200px] rounded-lg border border-white/10"
              />
              <button
                onClick={(e) => { e.stopPropagation(); onEditPrompt(); }}
                className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-violet-600"
              >
                Edit & Regenerate
              </button>
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
              <button
                onClick={(e) => { e.stopPropagation(); onEditPrompt(); }}
                className="text-violet-400 hover:text-violet-300 transition-colors"
              >
                Edit prompt
              </button>
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
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
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
        const rect = e.target.getBoundingClientRect();
        setDropdownPos({ top: rect.height + 4, left: 0 });
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
          className="absolute z-50 w-full bg-gray-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: dropdownPos.top }}
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
  onClose,
  onSubmit,
  onUndo,
  regenerating,
  undoing,
}: {
  scene: Scene;
  scenes: Scene[];
  imageModel: string;
  onClose: () => void;
  onSubmit: (prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[]) => void;
  onUndo: (() => void) | null;
  regenerating: boolean;
  undoing: boolean;
}) {
  const canEdit = scene.assetUrl && imageModel === "nano-banana-2";
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
    const prompt = mode === "edit" ? editInstruction : regenPrompt;
    const refs = parseSceneRefs(prompt);
    onSubmit(prompt, mode, refs);
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
                Edit Image
              </button>
            </div>
          )}

          {mode === "regenerate" ? (
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
                {imageModel === "nano-banana-2" && (
                  <span className="text-xs text-gray-600">Type @ to reference another scene</span>
                )}
              </div>
            </>
          ) : (
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

          <div className="flex gap-3">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              Cancel
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
  const [generatingSceneIds, setGeneratingSceneIds] = useState<Set<string>>(new Set());

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
    updates: { text?: string; duration?: number }
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

  function handleDeleteScene(sceneId: string) {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
    fetch(`/api/videos/${id}/scenes/${sceneId}`, { method: "DELETE" });
  }

  async function generateImageForScene(
    sceneId: string,
    promptOverride?: string,
    mode: "regenerate" | "edit" = "regenerate",
    referenceSceneIds?: string[]
  ) {
    setGeneratingSceneIds((prev) => new Set(prev).add(sceneId));
    try {
      const body: Record<string, unknown> = { mode };
      if (promptOverride) body.imagePrompt = promptOverride;
      if (referenceSceneIds && referenceSceneIds.length > 0) body.referenceSceneIds = referenceSceneIds;

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

  async function handleGenerateAllImages() {
    setGeneratingAll(true);
    const scenesWithoutImages = scenes.filter((s) => !s.assetUrl);

    await Promise.all(
      scenesWithoutImages.map((s) => generateImageForScene(s.id))
    );

    setGeneratingAll(false);
  }

  useEffect(() => {
    if (editingScene) {
      const fresh = scenes.find((s) => s.id === editingScene.id);
      if (fresh && fresh.assetUrl !== editingScene.assetUrl) {
        setEditingScene({ ...fresh });
      }
    }
  }, [scenes, editingScene]);

  async function handleGenerateImage(prompt: string, mode: "regenerate" | "edit", referenceSceneIds: string[]) {
    if (!editingScene) return;
    setPreviousAssetUrl(editingScene.assetUrl);
    setRegenerating(true);
    await generateImageForScene(editingScene.id, prompt, mode, referenceSceneIds);
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
          {video?.title ?? (video?.series?.videoType === "music_video" ? "Review Song" : "Review Script")}
        </h1>
        <p className="text-gray-400 text-sm">
          {video?.series?.videoType === "music_video"
            ? "Review your song lyrics and sections, then generate preview images before creating the music video."
            : "Review your script, then generate preview images to approve before creating the video."}
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
            {someImagesGenerated && (
              <div>
                <span className="text-gray-500">Images:</span>{" "}
                <span className="text-white font-medium">
                  {scenes.filter((s) => s.assetUrl).length}/{scenes.length}
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!allImagesGenerated && (
              <Button
                variant="outline"
                size="sm"
                loading={generatingAll}
                onClick={handleGenerateAllImages}
                disabled={scenes.length === 0}
              >
                {someImagesGenerated ? "Generate Remaining" : "Generate Preview Images"}
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
          </div>
        </CardContent>
      </Card>

      {!allImagesGenerated && scenes.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-300">
            Generate preview images to see what each scene will look like before creating the video.
            You can edit prompts and regenerate until you&apos;re happy.
          </p>
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
                generatingImage={generatingSceneIds.has(scene.id)}
                isMusicVideo={video?.series?.videoType === "music_video"}
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
      {scenes.length > 0 && (
        <div className="mt-8 flex justify-center gap-3">
          {!allImagesGenerated && (
            <Button
              variant="outline"
              size="lg"
              loading={generatingAll}
              onClick={handleGenerateAllImages}
            >
              Generate Preview Images
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
        </div>
      )}

      {/* Prompt edit modal */}
      {editingScene && (
        <PromptEditModal
          scene={editingScene}
          scenes={scenes}
          imageModel={video?.series?.imageModel || "dall-e-3"}
          onClose={() => { setEditingScene(null); setPreviousAssetUrl(null); }}
          onSubmit={handleGenerateImage}
          onUndo={previousAssetUrl ? handleUndo : null}
          regenerating={regenerating}
          undoing={undoing}
        />
      )}
    </div>
  );
}
