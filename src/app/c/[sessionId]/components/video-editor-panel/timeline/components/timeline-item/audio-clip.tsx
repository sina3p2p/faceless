"use client";

import { memo } from "react";
import { useTimelineStore } from "../../stores/use-timeline-store";
import { useClipDrag } from "./use-clip-drag";
import { DragPlaceholder } from "./drag-placeholder";
import { CLIP_TRACK_H } from "../../constants";
import type { AudioTimelineItem } from "../../types";

interface AudioClipProps {
  item: AudioTimelineItem;
  pxPerSec: number;
  left: number;
  top: number;
}

// See the matching comment in video-clip.tsx — `tracks` is rebuilt fresh on
// every state change, so compare rendered fields by value instead of props.
function propsEqual(prev: AudioClipProps, next: AudioClipProps): boolean {
  return (
    prev.pxPerSec === next.pxPerSec &&
    prev.left === next.left &&
    prev.top === next.top &&
    prev.item.id === next.item.id &&
    prev.item.start === next.item.start &&
    prev.item.end === next.item.end &&
    prev.item.clip.name === next.item.clip.name &&
    prev.item.clip.trimStart === next.item.clip.trimStart &&
    prev.item.clip.trimEnd === next.item.clip.trimEnd &&
    prev.item.clip.volume === next.item.clip.volume
  );
}

export const AudioClip = memo(function AudioClip({
  item,
  pxPerSec,
  left,
  top,
}: AudioClipProps) {
  const clip = item.clip;
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const onDeleteItems = useTimelineStore((s) => s.onDeleteItems);
  const draggingItemId = useTimelineStore((s) => s.draggingItemId);
  const { onPointerDownMove, onPointerMoveMove, onPointerUpMove, startTrimDrag } = useClipDrag(item.id, pxPerSec);

  const isDragging = draggingItemId === item.id;
  const isSelected = selectedItemIds.includes(item.id);
  const duration = item.end - item.start;
  const width = Math.max(duration * pxPerSec, 24);

  return (
    <div
      className={`absolute rounded-lg overflow-hidden select-none border-2 cursor-grab active:cursor-grabbing transition-[border,box-shadow] ${isSelected ? "border-teal-400 ring-2 ring-teal-400/30 z-20" : "border-teal-900/60 hover:border-teal-700/80 z-10"
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
          <div className="absolute inset-0 bg-linear-to-br from-teal-950/90 to-teal-900/50" />
          <div className="absolute inset-0 flex items-center gap-px px-2 overflow-hidden opacity-50">
            {Array.from({ length: Math.floor(width / 4) }, (_, i) => (
              <div key={i} className="w-px shrink-0 bg-teal-400 rounded-full"
                style={{ height: `${30 + Math.sin(i * 0.8) * 20 + Math.sin(i * 0.3) * 15}%` }} />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          <div className="absolute left-2 top-1.5 flex items-center gap-1">
            <svg className="w-3 h-3 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
            </svg>
            <span className="text-[9px] font-medium text-teal-300 truncate" style={{ maxWidth: width - 32 }}>{clip.name}</span>
          </div>
          {duration > 0 && (
            <span className="absolute bottom-1 right-2 text-[9px] font-mono text-teal-400/80 bg-black/50 px-1 rounded">
              {duration.toFixed(1)}s
            </span>
          )}
          <div className="absolute inset-0 pointer-events-none">
            <div
              data-trim
              className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize pointer-events-auto flex items-center justify-center group/h"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startTrimDrag(e, "start", { itemStart: item.start, itemEnd: item.end, trimStart: clip.trimStart, trimEnd: clip.trimEnd, rawDuration: clip.rawDuration });
              }}
            >
              <div className="w-[3px] h-8 rounded-full bg-teal-400/50 group-hover/h:bg-teal-300 transition-colors" />
            </div>
            <div
              data-trim
              className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize pointer-events-auto flex items-center justify-center group/h"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                startTrimDrag(e, "end", { itemStart: item.start, itemEnd: item.end, trimStart: clip.trimStart, trimEnd: clip.trimEnd, rawDuration: clip.rawDuration });
              }}
            >
              <div className="w-[3px] h-8 rounded-full bg-teal-400/50 group-hover/h:bg-teal-300 transition-colors" />
            </div>
          </div>
          {isSelected && (
            <button
              data-item-delete
              className="absolute top-1 left-1.5 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors z-10"
              onClick={(e) => { e.stopPropagation(); onDeleteItems([item.id]); }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}, propsEqual);
