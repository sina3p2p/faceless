"use client";

import { useRef } from "react";
import { useTimelineStore } from "../stores/use-timeline-store";
import { trackIndexOf, useTimelineTracks } from "../hooks/use-timeline-tracks";
import { CLIP_TRACK_H, LABEL_W } from "../constants";

export function TimelineTrackHandle({ trackIndex }: { trackIndex: number }) {
  const tracks = useTimelineStore((s) => s.tracks);
  const trackLocks = useTimelineStore((s) => s.trackLocks);
  const onTrackLockToggle = useTimelineStore((s) => s.onTrackLockToggle);
  const onTrackDelete = useTimelineStore((s) => s.onTrackDelete);
  const onTrackReorder = useTimelineStore((s) => s.onTrackReorder);
  const draggingTrackIndex = useTimelineStore((s) => s.draggingTrackIndex);
  const setDraggingTrackIndex = useTimelineStore((s) => s.setDraggingTrackIndex);
  const setTrackDropTarget = useTimelineStore((s) => s.setTrackDropTarget);
  const { numTracks } = useTimelineTracks(tracks);

  const hasTrack = tracks.some((t) => trackIndexOf(t.id) === trackIndex);
  const isLocked = trackLocks.has(trackIndex);
  const isDragging = draggingTrackIndex === trackIndex;

  const dragRef = useRef<{ startY: number; target: number } | null>(null);

  function onDragPointerDown(e: React.PointerEvent) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, target: trackIndex };
    setDraggingTrackIndex(trackIndex);
    setTrackDropTarget(trackIndex);
  }

  function onDragPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const delta = Math.round((e.clientY - d.startY) / CLIP_TRACK_H);
    const target = Math.max(0, Math.min(numTracks - 1, trackIndex + delta));
    if (target !== d.target) {
      d.target = target;
      setTrackDropTarget(target);
    }
  }

  function onDragPointerUp() {
    const d = dragRef.current;
    dragRef.current = null;
    setDraggingTrackIndex(null);
    setTrackDropTarget(null);
    if (d && d.target !== trackIndex) onTrackReorder(trackIndex, d.target);
  }

  if (!hasTrack) {
    return (
      <div
        className="absolute top-0 bottom-0 z-10 flex flex-col items-center justify-center border-r border-white/8 bg-black/40"
        style={{ width: LABEL_W, position: "sticky", left: 0 }}
      >
        <span className="text-[9px] text-muted-foreground/30 font-mono select-none">
          {trackIndex === 0 ? "Main" : `T${trackIndex + 1}`}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`absolute top-0 bottom-0 z-10 flex flex-row items-center justify-center gap-1.5 border-r border-white/8 bg-black/40 transition-opacity ${isDragging ? "opacity-40" : ""}`}
      style={{ width: LABEL_W, position: "sticky", left: 0 }}
    >
      <button
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        title="Drag to reorder track"
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5"
        style={{ touchAction: "none" }}
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
        </svg>
      </button>
      <button
        onClick={() => onTrackLockToggle(trackIndex)}
        title={isLocked ? "Unlock track" : "Lock track"}
        className={`p-0.5 transition-colors ${isLocked ? "text-amber-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
      >
        {isLocked ? (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        )}
      </button>
      <button
        onClick={() => onTrackDelete(trackIndex)}
        title="Delete track"
        className="p-0.5 text-muted-foreground/40 hover:text-red-400 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9M4.772 5.79a48.108 48.108 0 0 1 14.456 0m-14.456 0L5.42 20.673A2.25 2.25 0 0 0 7.664 22.75h8.672a2.25 2.25 0 0 0 2.244-2.077l1.144-14.883" />
        </svg>
      </button>
    </div>
  );
}
