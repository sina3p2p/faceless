"use client";

import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditorScene } from "./VideoComposition";

interface TimelineProps {
  scenes: EditorScene[];
  selectedSceneId: string | null;
  currentFrame: number;
  fps: number;
  onSelectScene: (id: string) => void;
  onReorder: (scenes: EditorScene[]) => void;
  onDeleteScene: (id: string) => void;
}

function SortableSceneBlock({
  scene,
  index,
  isSelected,
  isPlaying,
  onSelect,
  onDelete,
}: {
  scene: EditorScene;
  index: number;
  isSelected: boolean;
  isPlaying: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`relative flex-shrink-0 w-36 h-24 rounded-lg border-2 cursor-pointer transition-all overflow-hidden group ${
        isSelected
          ? "border-violet-500 ring-2 ring-violet-500/30"
          : isPlaying
          ? "border-violet-400/50"
          : "border-white/10 hover:border-white/20"
      }`}
    >
      {scene.assetUrl && scene.assetType === "image" ? (
        <img
          src={scene.assetUrl}
          alt={`Scene ${index + 1}`}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-violet-900/40 to-black flex items-center justify-center">
          <svg className="w-6 h-6 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
          </svg>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      <div className="absolute top-1 left-1.5">
        <span className="text-[10px] font-bold text-white/80 bg-black/50 px-1.5 py-0.5 rounded">
          {index + 1}
        </span>
      </div>

      <div className="absolute bottom-1 left-1.5 right-1.5 flex items-end justify-between">
        <p className="text-[10px] text-white/70 truncate flex-1 mr-1">
          {scene.text.slice(0, 30)}...
        </p>
        <span className="text-[10px] font-mono text-white/60 bg-black/50 px-1 rounded">
          {scene.duration.toFixed(1)}s
        </span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-1 w-5 h-5 rounded bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
      >
        x
      </button>
    </div>
  );
}

export function Timeline({
  scenes,
  selectedSceneId,
  currentFrame,
  fps,
  onSelectScene,
  onReorder,
  onDeleteScene,
}: TimelineProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const currentTime = currentFrame / fps;
  const playingSceneId = useMemo(() => {
    let elapsed = 0;
    for (const scene of scenes) {
      if (currentTime >= elapsed && currentTime < elapsed + scene.duration) {
        return scene.id;
      }
      elapsed += scene.duration;
    }
    return null;
  }, [scenes, currentTime]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(scenes, oldIndex, newIndex).map((s, i) => ({
      ...s,
      sceneOrder: i,
    }));
    onReorder(reordered);
  }

  const totalDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

  return (
    <div className="bg-black/40 border-t border-white/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Timeline
        </h3>
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
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {scenes.map((scene, i) => (
              <SortableSceneBlock
                key={scene.id}
                scene={scene}
                index={i}
                isSelected={scene.id === selectedSceneId}
                isPlaying={scene.id === playingSceneId}
                onSelect={() => onSelectScene(scene.id)}
                onDelete={() => onDeleteScene(scene.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
