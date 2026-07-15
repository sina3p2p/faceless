"use client";

import { memo } from "react";
import { useTimelineStore } from "../../stores/use-timeline-store";
import { useClipDrag } from "./use-clip-drag";
import { Filmstrip } from "./filmstrip";
import { TrimHandle } from "./trim-handle";
import { DragPlaceholder } from "./drag-placeholder";
import { CLIP_TRACK_H } from "../../constants";
import type { VideoTimelineItem } from "../../types";

interface VideoClipProps {
  item: VideoTimelineItem;
  pxPerSec: number;
  left: number;
  top: number;
  isActive: boolean;
}

// `tracks` (and every item in it) is rebuilt fresh on every state change —
// including every pointermove during a drag — so a plain reference-equality
// memo would never hit. Compare the fields that actually affect rendering
// instead, so only the clip(s) actually changing re-render during a drag.
function propsEqual(prev: VideoClipProps, next: VideoClipProps): boolean {
  return (
    prev.pxPerSec === next.pxPerSec &&
    prev.left === next.left &&
    prev.top === next.top &&
    prev.isActive === next.isActive &&
    prev.item.id === next.item.id &&
    prev.item.start === next.item.start &&
    prev.item.end === next.item.end &&
    prev.item.clip.videoUrl === next.item.clip.videoUrl &&
    prev.item.clip.filmstripUrl === next.item.clip.filmstripUrl &&
    prev.item.clip.filmstripTiles === next.item.clip.filmstripTiles &&
    prev.item.clip.trimStart === next.item.clip.trimStart &&
    prev.item.clip.trimEnd === next.item.clip.trimEnd &&
    prev.item.clip.reversed === next.item.clip.reversed &&
    prev.item.clip.approved === next.item.clip.approved
  );
}

export const VideoClip = memo(function VideoClip({
  item,
  pxPerSec,
  left,
  top,
  isActive,
}: VideoClipProps) {
  const clip = item.clip;
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const onDeleteItems = useTimelineStore((s) => s.onDeleteItems);
  const getRawDuration = useTimelineStore((s) => s.getRawDuration);
  const draggingItemId = useTimelineStore((s) => s.draggingItemId);
  const { onPointerDownMove, onPointerMoveMove, onPointerUpMove, startTrimDrag } = useClipDrag(item.id, pxPerSec);

  const isDragging = draggingItemId === item.id;
  const isSelected = selectedItemIds.includes(item.id);
  const raw = getRawDuration(clip.id);
  const isTrimmed = clip.trimStart > 0 || clip.trimEnd !== null;
  const duration = item.end - item.start;
  const width = Math.max(duration * pxPerSec, 24);

  return (
    <div
      className={`absolute rounded-lg overflow-hidden select-none border-2 transition-[border,box-shadow] cursor-grab active:cursor-grabbing ${isSelected
        ? "border-primary ring-2 ring-primary/30 z-20"
        : isActive
          ? "border-primary/50 z-10"
          : "border-white/10 hover:border-white/30 z-10"
        }`}
      style={{ left, top: top + 4, width, height: CLIP_TRACK_H - 8 }}
      onPointerDown={onPointerDownMove}
      onPointerMove={onPointerMoveMove}
      onPointerUp={onPointerUpMove}
      onPointerCancel={onPointerUpMove}
    >
      {isDragging ? (
        <DragPlaceholder />
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 to-indigo-950/80" />

          {clip.filmstripUrl ? (
            <Filmstrip
              filmstripUrl={clip.filmstripUrl}
              tileCount={clip.filmstripTiles}
              durationSeconds={raw > 0 ? raw : undefined}
              trimStart={clip.trimStart}
              trimEnd={clip.trimEnd}
              reversed={clip.reversed}
              pxPerSec={pxPerSec}
            />
          ) : null}

          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

          <div className="absolute top-1 right-2 flex items-center gap-1">
            {clip.reversed && <span className="text-[8px] font-bold text-amber-400 bg-black/60 px-1 py-0.5 rounded">REV</span>}
            {clip.approved && (
              <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                <svg className="w-2 h-2 text-foreground" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
              </span>
            )}
          </div>

          {duration > 0 && (
            <span className="absolute bottom-1 right-2 text-[9px] font-mono text-white/70 bg-black/50 px-1 rounded">
              {duration.toFixed(1)}s
            </span>
          )}

          {isTrimmed && clip.trimStart > 0 && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-sky-400/70" />}
          {isTrimmed && clip.trimEnd !== null && <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-sky-400/70" />}

          <div className={`absolute inset-0 transition-opacity pointer-events-none ${isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"}`}>
            <TrimHandle
              edge="start"
              onPointerDown={(e) => startTrimDrag(e, "start", { itemStart: item.start, itemEnd: item.end, trimStart: clip.trimStart, trimEnd: clip.trimEnd, rawDuration: raw })}
            />
            <TrimHandle
              edge="end"
              onPointerDown={(e) => startTrimDrag(e, "end", { itemStart: item.start, itemEnd: item.end, trimStart: clip.trimStart, trimEnd: clip.trimEnd, rawDuration: raw })}
            />
          </div>

          {isSelected && (
            <button
              data-item-delete
              className="absolute top-1 left-1.5 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); onDeleteItems([item.id]); }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}, propsEqual);
