import { useLayoutEffect, useRef } from "react";
import { useTimelineStore } from "../../stores/use-timeline-store";
import { usePointerDrag } from "../../../use-pointer-drag";
import { resolveDropPosition } from "../../utils/gap-utils";
import { trackIndexOf, trackIdOf, findItem } from "../../hooks/use-timeline-tracks";
import { CLIP_TRACK_H, MAX_TRACKS } from "../../constants";

// Shared move + trim drag behavior for video-clip.tsx and audio-clip.tsx —
// both just fire onItemMove/onItemResize with the item's id.
export function useClipDrag(itemId: string, pxPerSec: number) {
  const tracks = useTimelineStore((s) => s.tracks);
  const trackLocks = useTimelineStore((s) => s.trackLocks);
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const onItemSelect = useTimelineStore((s) => s.onItemSelect);
  const onItemMove = useTimelineStore((s) => s.onItemMove);
  const onItemResize = useTimelineStore((s) => s.onItemResize);
  const setDraggingItemId = useTimelineStore((s) => s.setDraggingItemId);
  const setSnapGuide = useTimelineStore((s) => s.setSnapGuide);
  const setTrimTooltip = useTimelineStore((s) => s.setTrimTooltip);

  const isSelected = selectedItemIds.includes(itemId);
  const pxPerSecRef = useRef(pxPerSec);
  useLayoutEffect(() => {
    pxPerSecRef.current = pxPerSec;
  });

  const moveDragRef = useRef<{
    startX: number;
    startY: number;
    members: { id: string; start: number; trackIndex: number; duration: number }[];
  } | null>(null);

  function onPointerDownMove(e: React.PointerEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("[data-trim]") || target.closest("[data-item-delete]")) return;
    const self = findItem(tracks, itemId);
    if (self && trackLocks.has(trackIndexOf(self.trackId))) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    onItemSelect(itemId);
    const groupIds = isSelected && selectedItemIds.length > 1 ? selectedItemIds : [itemId];
    const members = groupIds
      .map((id) => findItem(tracks, id))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((x) => ({ id: x.id, start: x.start, trackIndex: trackIndexOf(x.trackId), duration: x.end - x.start }));
    moveDragRef.current = { startX: e.clientX, startY: e.clientY, members };
    setDraggingItemId(itemId);
  }

  function onPointerMoveMove(e: React.PointerEvent) {
    const d = moveDragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / pxPerSecRef.current;
    const dyTracks = Math.round((e.clientY - d.startY) / CLIP_TRACK_H);

    if (d.members.length === 1) {
      const m = d.members[0]!;
      const desiredStart = Math.max(0, m.start + dx);
      const newTrackIndex = Math.max(0, Math.min(MAX_TRACKS - 1, m.trackIndex + dyTracks));
      const obstacles =
        tracks
          .find((t) => trackIndexOf(t.id) === newTrackIndex)
          ?.items.filter((it) => it.id !== m.id)
          .map((it) => ({ start: it.start, end: it.end })) ?? [];
      const { start: resolvedStart, snapped } = resolveDropPosition(desiredStart, m.duration, obstacles);
      setSnapGuide(snapped ? resolvedStart : null);
      onItemMove(m.id, resolvedStart, resolvedStart + m.duration, trackIdOf(newTrackIndex));
    } else {
      // Group move: same delta for every selected item, no cross-item snapping.
      // ponytail: per-item snap resolution during group drag, add if it's ever needed.
      for (const m of d.members) {
        const newStart = Math.max(0, m.start + dx);
        const newTrackIndex = Math.max(0, Math.min(MAX_TRACKS - 1, m.trackIndex + dyTracks));
        onItemMove(m.id, newStart, newStart + m.duration, trackIdOf(newTrackIndex));
      }
    }
  }

  function onPointerUpMove() {
    moveDragRef.current = null;
    setDraggingItemId(null);
    setSnapGuide(null);
  }

  interface TrimDragState {
    edge: "start" | "end";
    startX: number;
    itemStart: number;
    itemEnd: number;
    initialValue: number; // trimStart (edge="start") or trimEnd-or-raw (edge="end") at drag start
    rawDuration: number;
    otherEdge: number; // trimEnd-or-raw (edge="start") or trimStart (edge="end")
  }

  const runTrimDrag = usePointerDrag<TrimDragState>(
    (state, { clientX, clientY }) => {
      const deltaTime = (clientX - state.startX) / pxPerSecRef.current;
      const clamped =
        state.edge === "start"
          ? Math.max(0, Math.min(state.initialValue + deltaTime, state.otherEdge - 0.15))
          : Math.max(state.otherEdge + 0.15, Math.min(state.initialValue + deltaTime, state.rawDuration));

      if (state.edge === "start") {
        const actualDelta = clamped - state.initialValue;
        const newStart = Math.max(0, state.itemStart + actualDelta);
        onItemResize(itemId, newStart, state.itemEnd);
      } else {
        const newEnd = state.itemStart + (clamped - state.otherEdge);
        onItemResize(itemId, state.itemStart, newEnd);
      }
      setTrimTooltip({ x: clientX, y: clientY, time: clamped });
    },
    () => setTrimTooltip(null),
  );

  function startTrimDrag(
    e: React.PointerEvent,
    edge: "start" | "end",
    opts: { itemStart: number; itemEnd: number; trimStart: number; trimEnd: number | null; rawDuration: number },
  ) {
    const self = findItem(tracks, itemId);
    if (self && trackLocks.has(trackIndexOf(self.trackId))) return;
    const { itemStart, itemEnd, trimStart, trimEnd, rawDuration } = opts;
    const initialValue = edge === "start" ? trimStart : (trimEnd ?? rawDuration);
    const otherEdge = edge === "start" ? (trimEnd ?? rawDuration) : trimStart;
    onItemSelect(itemId);
    runTrimDrag({ edge, startX: e.clientX, itemStart, itemEnd, initialValue, rawDuration, otherEdge }, e);
  }

  return { onPointerDownMove, onPointerMoveMove, onPointerUpMove, startTrimDrag };
}
