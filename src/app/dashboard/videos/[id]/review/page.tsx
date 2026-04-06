"use client";

import { useEffect, useState, useCallback } from "react";
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
  duration: number;
}

interface VideoDetail {
  id: string;
  seriesId: string;
  title: string | null;
  status: string;
  duration: number | null;
  series: { name: string; niche: string };
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
          : "border-white/5 bg-white/[0.02] hover:border-white/10"
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
          {editing ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleTextSave}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setText(scene.text);
                  setEditing(false);
                }
              }}
              autoFocus
              rows={3}
              className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          ) : (
            <p
              className="text-sm text-gray-300 cursor-text hover:text-white transition-colors leading-relaxed"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {scene.text}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="font-mono">{duration.toFixed(1)}s</span>
            <span className="text-gray-700">&middot;</span>
            <span className="text-gray-600 hover:text-violet-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>
              Click to edit
            </span>
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="w-8 h-8 rounded-lg bg-white/5 text-gray-500 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-colors flex-shrink-0"
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

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [video, setVideo] = useState<VideoDetail | null>(null);

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
          {video?.title ?? "Review Script"}
        </h1>
        <p className="text-gray-400 text-sm">
          Review and edit your scenes before generating the video. You can reorder,
          edit text, adjust timing, or delete scenes. Click on the text to edit it.
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
              <span className="text-gray-500">Total Duration:</span>{" "}
              <span className="text-white font-medium font-mono">{totalDuration.toFixed(1)}s</span>
            </div>
          </div>
          <Button
            variant="primary"
            loading={rendering}
            onClick={handleStartRendering}
            disabled={scenes.length === 0}
          >
            Generate Video
          </Button>
        </CardContent>
      </Card>

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
        <div className="text-center py-16 text-gray-500">
          <p>No scenes to review</p>
        </div>
      )}

      {/* Bottom action */}
      {scenes.length > 0 && (
        <div className="mt-8 flex justify-center">
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
    </div>
  );
}
