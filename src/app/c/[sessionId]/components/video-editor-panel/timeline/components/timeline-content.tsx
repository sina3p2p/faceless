"use client";

import { useRef } from "react";
import { useTimelineStore } from "../stores/use-timeline-store";
import { useTimelineZoom } from "../hooks/use-timeline-zoom";
import { useTimelineTracks, trackIndexOf, useActiveItemId } from "../hooks/use-timeline-tracks";
import { TimelineTrack } from "./timeline-track";
import { VideoClip } from "./timeline-item/video-clip";
import { AudioClip } from "./timeline-item/audio-clip";
import { TimelineMarkers } from "./timeline-markers";
import { TimelineGuidelines } from "./timeline-guidelines";
import { RULER_H, CLIP_TRACK_H, HEADER_H, LABEL_W } from "../constants";
import type { MarqueeRect } from "../stores/use-timeline-store";
import type { TimelineTrack as TimelineTrackType } from "../types";

function normalizeRect(rect: MarqueeRect) {
  return {
    xMin: Math.min(rect.x0, rect.x1),
    xMax: Math.max(rect.x0, rect.x1),
    yMin: Math.min(rect.y0, rect.y1),
    yMax: Math.max(rect.y0, rect.y1),
  };
}

function computeMarqueeSelection(tracks: TimelineTrackType[], rect: MarqueeRect, pxPerSec: number): string[] {
  const { xMin, xMax, yMin, yMax } = normalizeRect(rect);
  const timeMin = (xMin - LABEL_W) / pxPerSec;
  const timeMax = (xMax - LABEL_W) / pxPerSec;
  const trackMin = Math.floor((yMin - RULER_H) / CLIP_TRACK_H);
  const trackMax = Math.floor((yMax - RULER_H) / CLIP_TRACK_H);
  const ids: string[] = [];
  for (const track of tracks) {
    const idx = trackIndexOf(track.id);
    if (idx < trackMin || idx > trackMax) continue;
    for (const item of track.items) {
      if (item.end > timeMin && item.start < timeMax) ids.push(item.id);
    }
  }
  return ids;
}

export function TimelineContent({ pxPerSec, totalDuration }: { pxPerSec: number; totalDuration: number }) {
  const tracks = useTimelineStore((s) => s.tracks);
  const clipTransitions = useTimelineStore((s) => s.clipTransitions);
  const transitionPickerFor = useTimelineStore((s) => s.transitionPickerFor);
  const onTransitionPickerChange = useTimelineStore((s) => s.onTransitionPickerChange);
  const onFrameChange = useTimelineStore((s) => s.onFrameChange);
  const onSelectedItemsChange = useTimelineStore((s) => s.onSelectedItemsChange);
  const fps = useTimelineStore((s) => s.fps);
  const marqueeRect = useTimelineStore((s) => s.marqueeRect);
  const setMarqueeRect = useTimelineStore((s) => s.setMarqueeRect);
  const setHoverTime = useTimelineStore((s) => s.setHoverTime);
  const draggingTrackIndex = useTimelineStore((s) => s.draggingTrackIndex);
  const trackDropTarget = useTimelineStore((s) => s.trackDropTarget);

  const { numTracks } = useTimelineTracks(tracks);
  const activeItemId = useActiveItemId();
  const timelineH = RULER_H + numTracks * CLIP_TRACK_H + HEADER_H;
  // No fixed px floor — a 600px min forced a horizontal scrollbar whenever chat
  // narrowed the editor below that width, even when the timeline fit.
  const contentWidth = totalDuration * pxPerSec + 96;

  const scrollRef = useRef<HTMLDivElement>(null);
  const { handleWheel } = useTimelineZoom(scrollRef);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

  const hasVideoItems = tracks.some((t) => t.items.some((it) => it.type === "video"));

  function localPoint(e: { clientX: number; clientY: number }) {
    const rect = scrollRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left + scrollRef.current!.scrollLeft, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0 || !scrollRef.current) return;
    onTransitionPickerChange(null);
    dragStartRef.current = localPoint(e);
    draggedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!scrollRef.current) return;
    const { x, y } = localPoint(e);
    setHoverTime(Math.max(0, (x - LABEL_W) / pxPerSec));

    const start = dragStartRef.current;
    if (!start) return;
    if (!draggedRef.current && Math.hypot(x - start.x, y - start.y) < 4) return;
    draggedRef.current = true;
    setMarqueeRect({ x0: start.x, y0: start.y, x1: x, y1: y });
  }

  function handlePointerUp() {
    if (draggedRef.current) {
      const rect = useTimelineStore.getState().marqueeRect;
      if (rect) onSelectedItemsChange(computeMarqueeSelection(tracks, rect, pxPerSec));
    } else if (dragStartRef.current) {
      const { x } = dragStartRef.current;
      onFrameChange(Math.max(0, Math.round(((x - LABEL_W) / pxPerSec) * fps)));
      onSelectedItemsChange([]);
    }
    dragStartRef.current = null;
    draggedRef.current = false;
    setMarqueeRect(null);
  }

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-x-auto overflow-y-hidden relative"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onMouseLeave={() => setHoverTime(null)}
      style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2a2a transparent" }}
    >
      <div className="relative" style={{ width: contentWidth, minWidth: "100%", height: timelineH - HEADER_H }}>
        <TimelineMarkers pxPerSec={pxPerSec} totalDuration={totalDuration} />
        <TimelineGuidelines pxPerSec={pxPerSec} />

        {Array.from({ length: numTracks }, (_, ti) => (
          <TimelineTrack key={ti} trackIndex={ti} />
        ))}

        {/* Flat sibling list (not nested per-track) so an item moving between
            tracks is a style change, not an unmount/remount that would drop
            an in-progress drag gesture's pointer capture. */}
        {tracks.flatMap((track) =>
          track.items.map((item) => {
            const left = LABEL_W + item.start * pxPerSec;
            const top = RULER_H + trackIndexOf(track.id) * CLIP_TRACK_H;
            return item.type === "video" ? (
              <VideoClip key={item.id} item={item} pxPerSec={pxPerSec} left={left} top={top} isActive={item.id === activeItemId} />
            ) : (
              <AudioClip key={item.id} item={item} pxPerSec={pxPerSec} left={left} top={top} />
            );
          }),
        )}

        {!hasVideoItems && (
          <div className="absolute pointer-events-none" style={{ left: LABEL_W + 16, top: RULER_H + 24 }}>
            <span className="text-[10px] text-muted-foreground/30">Generate shots to start editing</span>
          </div>
        )}

        {/* Transition joints between adjacent video clips on the same track */}
        {tracks.flatMap((track) => {
          const videoItems = track.items.filter((it) => it.type === "video");
          return videoItems.flatMap((itemA) =>
            videoItems
              .filter((itemB) => itemB.id !== itemA.id && Math.abs(itemB.start - itemA.end) <= 0)
              .map((itemB) => {
                const joinX = LABEL_W + itemA.end * pxPerSec;
                const joinY = RULER_H + trackIndexOf(track.id) * CLIP_TRACK_H;
                const trans = clipTransitions.get(itemB.id);
                const hasTransition = trans && trans.type !== "cut";
                const isOpen = transitionPickerFor === itemB.id;
                const BTN = 32;
                return (
                  <button
                    key={`tj-${itemA.id}-${itemB.id}`}
                    className={`absolute z-40 rounded-full border-2 flex items-center justify-center transition-all shadow-xl group ${isOpen
                      ? "bg-primary border-primary text-foreground scale-110"
                      : hasTransition
                        ? "bg-primary/20 border-primary text-foreground hover:scale-110"
                        : "bg-background/30 border-white/20 text-muted-foreground hover:border-primary hover:text-primary hover:scale-110"
                      }`}
                    style={{ left: joinX - BTN / 2, top: joinY + 4 + (CLIP_TRACK_H - 8 - BTN) / 2, width: BTN, height: BTN }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTransitionPickerChange(isOpen ? null : itemB.id);
                    }}
                    title={hasTransition ? `Transition: ${trans.type}` : "Add transition"}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                    </svg>
                    <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold bg-gray-900 text-foreground px-2 py-1 rounded-lg shadow-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {hasTransition ? trans.type : "Add transition"}
                    </span>
                  </button>
                );
              }),
          );
        })}

        {draggingTrackIndex !== null && trackDropTarget !== null && (
          <div
            className="absolute left-0 right-0 z-40 h-0.5 bg-primary pointer-events-none rounded-full shadow-[0_0_6px_var(--primary)]"
            style={{ top: RULER_H + trackDropTarget * CLIP_TRACK_H - 1 }}
          />
        )}

        {marqueeRect && (
          <div
            className="absolute z-40 border border-primary/60 bg-primary/10 pointer-events-none"
            style={{
              left: Math.min(marqueeRect.x0, marqueeRect.x1),
              top: Math.min(marqueeRect.y0, marqueeRect.y1),
              width: Math.abs(marqueeRect.x1 - marqueeRect.x0),
              height: Math.abs(marqueeRect.y1 - marqueeRect.y0),
            }}
          />
        )}
      </div>
    </div>
  );
}
