"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import Image from "next/image";

interface Scene {
  id: string;
  sceneOrder: number;
  text: string;
  duration: number;
  audioUrl: string | null;
  assetUrl: string | null;
  assetType: string | null;
  wordTimestamps: unknown[];
}

function SortableSceneCard({
  scene,
  index,
  isSelected,
  onSelect,
  onDelete,
  onUpdate,
}: {
  scene: Scene;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onUpdate: (updates: { text?: string; duration?: number }) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const [editingText, setEditingText] = useState(false);
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
    setEditingText(false);
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
          : "border-white/5 bg-white/[0.02] hover:border-white/10"
        }`}
    >
      <div className="flex gap-3 p-3">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="flex flex-col items-center justify-center gap-1 px-1 cursor-grab active:cursor-grabbing text-gray-500 hover:text-gray-300"
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

        {/* Thumbnail */}
        <div className="w-20 h-14 rounded-lg overflow-hidden bg-black flex-shrink-0">
          {scene.assetUrl ? (
            scene.assetType === "video" ? (
              <video src={scene.assetUrl} className="w-full h-full object-cover" muted />
            ) : (
              <Image src={scene.assetUrl} alt="" className="w-full h-full object-cover" />
            )
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-violet-900/30 to-black flex items-center justify-center">
              <span className="text-violet-400 font-bold text-lg">{index + 1}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded">
              Scene {index + 1}
            </span>
            <span className="text-[10px] font-mono text-gray-500">
              {duration.toFixed(1)}s
            </span>
          </div>

          {editingText ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleTextSave}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setText(scene.text);
                  setEditingText(false);
                }
              }}
              autoFocus
              rows={2}
              className="w-full bg-black/40 border border-white/10 rounded px-2 py-1 text-xs text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          ) : (
            <p
              className="text-xs text-gray-300 line-clamp-2 cursor-text hover:text-white transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setEditingText(true);
              }}
            >
              {scene.text}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="w-7 h-7 rounded-lg bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors text-xs"
            title="Delete scene"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Duration slider (shown when selected) */}
      {isSelected && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5">
          <div className="flex items-center gap-3">
            <label className="text-[10px] text-gray-500 whitespace-nowrap">Duration</label>
            <input
              type="range"
              min={1}
              max={30}
              step={0.5}
              value={duration}
              onChange={(e) => handleDurationChange(parseFloat(e.target.value))}
              className="flex-1 accent-violet-500 h-1"
            />
            <span className="text-[10px] font-mono text-gray-400 w-8 text-right">
              {duration.toFixed(1)}s
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VideoEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rerendering, setRerendering] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoSize, setVideoSize] = useState<string>("9:16");
  const [hasChanges, setHasChanges] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const loadData = useCallback(async () => {
    try {
      const [scenesRes, videoRes, downloadRes] = await Promise.all([
        fetch(`/api/videos/${id}/scenes`),
        fetch(`/api/videos/${id}`),
        fetch(`/api/videos/${id}/download`),
      ]);

      if (scenesRes.ok) {
        const data = await scenesRes.json();
        setScenes(
          data.scenes.map((s: Scene) => ({
            ...s,
            duration: s.duration ?? 5,
            wordTimestamps: s.wordTimestamps ?? [],
          }))
        );
      }

      if (videoRes.ok) {
        const data = await videoRes.json();
        setVideoTitle(data.title ?? "Untitled Video");
        if (data.series?.videoSize) setVideoSize(data.series.videoSize);
      }

      if (downloadRes.ok) {
        const data = await downloadRes.json();
        if (data.url) setVideoUrl(data.url);
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
    setHasChanges(true);

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
    setHasChanges(true);

    fetch(`/api/videos/${id}/scenes/${sceneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
  }

  function handleDeleteScene(sceneId: string) {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    if (selectedSceneId === sceneId) setSelectedSceneId(null);
    setHasChanges(true);

    fetch(`/api/videos/${id}/scenes/${sceneId}`, { method: "DELETE" });
  }

  async function handleRerender() {
    setRerendering(true);
    try {
      const res = await fetch(`/api/videos/${id}/rerender`, { method: "POST" });
      if (res.ok) {
        router.push(`/dashboard/videos/${id}`);
      }
    } catch { }
    setRerendering(false);
  }

  const totalDuration = scenes.reduce((s, sc) => s + sc.duration, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/dashboard/videos/${id}`)}
          >
            &larr; Back
          </Button>
          <h1 className="text-lg font-semibold text-gray-200 truncate">
            {videoTitle}
          </h1>
          {hasChanges && (
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">
              Unsaved changes
            </span>
          )}
        </div>
        <Button
          variant="primary"
          loading={rerendering}
          onClick={handleRerender}
          disabled={!hasChanges}
        >
          Re-render Video
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Video preview */}
        <div>
          <div className="rounded-xl overflow-hidden bg-black max-h-[65vh] mx-auto" style={{ aspectRatio: videoSize === "16:9" ? "16/9" : videoSize === "1:1" ? "1/1" : "9/16" }}>
            {videoUrl ? (
              <video
                src={videoUrl}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-600">
                <p className="text-sm">Video preview unavailable</p>
              </div>
            )}
          </div>
          <p className="text-center text-xs text-gray-500 mt-2">
            Current version &middot; Re-render to apply edits
          </p>
        </div>

        {/* Right: Scene list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-300">
              Scenes ({scenes.length})
            </h2>
            <span className="text-xs text-gray-500 font-mono">
              {totalDuration.toFixed(1)}s total
            </span>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={scenes.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {scenes.map((scene, i) => (
                  <SortableSceneCard
                    key={scene.id}
                    scene={scene}
                    index={i}
                    isSelected={scene.id === selectedSceneId}
                    onSelect={() =>
                      setSelectedSceneId(
                        scene.id === selectedSceneId ? null : scene.id
                      )
                    }
                    onDelete={() => handleDeleteScene(scene.id)}
                    onUpdate={(updates) => handleUpdateScene(scene.id, updates)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {scenes.length === 0 && (
            <div className="text-center py-10 text-gray-500 text-sm">
              No scenes — nothing to edit
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
