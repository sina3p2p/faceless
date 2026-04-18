"use client";

import { Fragment, useRef } from "react";
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
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SceneBlock } from "./scene-block";
import { ZoomControls } from "./zoom-controls";
import { useCanvasTransform } from "../hooks/use-canvas-transform";
import type { Scene, VideoDetail } from "@/types/video-detail";

export function StudioCanvas({
  scenes,
  video,
  selectedSceneId,
  generatingSceneIds,
  generatingFrameIds,
  onSelectScene,
  onOpenLab,
  onDragEnd,
}: {
  scenes: Scene[];
  video: VideoDetail | null;
  selectedSceneId: string | null;
  generatingSceneIds: Set<string>;
  generatingFrameIds: Set<string>;
  onSelectScene: (id: string | null) => void;
  onOpenLab: (sceneId: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const {
    zoom, isPanning, containerRef, contentStyle,
    onWheel, onPointerDown, onPointerMove, onPointerUp,
    zoomIn, zoomOut, fitView, resetView, zoomModifier,
  } = useCanvasTransform();

  const contentRef = useRef<HTMLDivElement>(null);

  const videoSize = video?.series?.videoSize || "9:16";

  function handleFitView() {
    const el = contentRef.current;
    if (!el) return;
    fitView(el.scrollWidth, el.scrollHeight);
  }

  if (scenes.length === 0) {
    return (
      <div className="flex-1 bg-grid flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 15.75h7.5" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Scenes will appear here</p>
          <p className="text-xs text-gray-700">Waiting for pipeline to generate scenes...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-grid relative overflow-hidden"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ cursor: isPanning ? "grabbing" : undefined }}
    >
      {/* Transformed content layer */}
      <div
        ref={contentRef}
        style={contentStyle}
        className="flex gap-0 px-10 py-8 items-center h-full"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[zoomModifier]}
        >
          <SortableContext items={scenes.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
            {scenes.map((scene, i) => {
              const isAdjacent =
                selectedSceneId &&
                (scene.id === selectedSceneId || scenes[i + 1]?.id === selectedSceneId);

              return (
                <Fragment key={scene.id}>
                  <SceneBlock
                    scene={scene}
                    index={i}
                    isSelected={scene.id === selectedSceneId}
                    videoSize={videoSize}
                    isGenerating={
                      generatingSceneIds.has(scene.id) ||
                      (scene.frames?.some((f) => generatingFrameIds.has(f.id)) ?? false)
                    }
                    onSelect={() =>
                      onSelectScene(scene.id === selectedSceneId ? null : scene.id)
                    }
                    onDoubleClick={() => onOpenLab(scene.id)}
                  />
                  {i < scenes.length - 1 && (
                    <div
                      className={`w-5 h-px shrink-0 transition-colors ${
                        isAdjacent ? "bg-violet-500/40" : "bg-white/10"
                      }`}
                    />
                  )}
                </Fragment>
              );
            })}
          </SortableContext>
        </DndContext>
      </div>

      {/* Zoom controls (outside transform layer) */}
      <ZoomControls
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitView={handleFitView}
        onResetView={resetView}
      />
    </div>
  );
}
