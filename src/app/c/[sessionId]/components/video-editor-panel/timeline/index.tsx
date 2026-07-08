"use client";

import { useLayoutEffect } from "react";
import { timelineCallbackRefs, useTimelineStore } from "./stores/use-timeline-store";
import { useZoomStore } from "./stores/use-zoom-store";
import { useTimelineShortcuts } from "./hooks/use-timeline-shortcuts";
import { useTimelineTracks } from "./hooks/use-timeline-tracks";
import { TimelineContent } from "./components/timeline-content";
import { TimelineHeader } from "./components/timeline-header";
import { HEADER_H, RULER_H, CLIP_TRACK_H } from "./constants";
import type { TimelineTrack, TransitionSetting, NewTimelineItemInput } from "./types";

export interface TimelineProps {
  tracks: TimelineTrack[];
  totalDuration: number;
  currentFrame: number;
  fps: number;
  onFrameChange: (frame: number) => void;
  onTracksChange: (tracks: TimelineTrack[]) => void;
  onItemMove: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize: (itemId: string, newStart: number, newEnd: number) => void;
  onItemSelect: (itemId: string) => void;
  selectedItemIds: string[];
  onSelectedItemsChange: (itemIds: string[]) => void;
  onDeleteItems: (itemIds: string[]) => void;
  onDuplicateItems: (itemIds: string[]) => void;
  onSplitItems: (itemId: string, splitTime: number) => void;
  onAddNewItem: (item: NewTimelineItemInput) => void;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  // Beyond the reference contract — this app's own needs:
  getRawDuration: (id: string) => number;
  clipTransitions: Map<string, TransitionSetting>;
  transitionPickerFor: string | null;
  onTransitionPickerChange: (clipId: string | null) => void;
  trackLocks: Set<number>;
  onTrackLockToggle: (trackIndex: number) => void;
  onTrackDelete: (trackIndex: number) => void;
  onTrackReorder: (fromIndex: number, toIndex: number) => void;
  onReverseItems: (itemIds: string[]) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function Timeline(props: TimelineProps) {
  const { collapsed, tracks, totalDuration } = props;

  // Sync every render — this is what makes `Timeline` a controlled
  // component: nested components read tracks/selection from this store
  // instead of via prop drilling, but the store is never the source of
  // truth, just a mirror kept fresh from props.
  //
  // Callbacks go into a ref (stable wrappers in the store always call
  // through it). Putting fresh parent function identities into setState
  // would re-notify every subscriber on every parent render and can spin
  // into "Maximum update depth exceeded".
  //
  // Only data keys that actually changed are written: a subscriber reacting
  // to one synced field can cause this component to re-render with an
  // unrelated field's identity unchanged — writing it again anyway would
  // re-notify that subscriber and, if it reacts unconditionally, loop.
  useLayoutEffect(() => {
    timelineCallbackRefs.current = {
      onTracksChange: props.onTracksChange,
      onItemMove: props.onItemMove,
      onItemResize: props.onItemResize,
      onItemSelect: props.onItemSelect,
      onSelectedItemsChange: props.onSelectedItemsChange,
      onDeleteItems: props.onDeleteItems,
      onDuplicateItems: props.onDuplicateItems,
      onSplitItems: props.onSplitItems,
      onAddNewItem: props.onAddNewItem,
      onFrameChange: props.onFrameChange,
      onPlay: props.onPlay,
      onPause: props.onPause,
      onUndo: props.onUndo,
      onRedo: props.onRedo,
      getRawDuration: props.getRawDuration,
      setPlaybackRate: props.setPlaybackRate,
      onCollapsedChange: props.onCollapsedChange,
      onTransitionPickerChange: props.onTransitionPickerChange,
      onTrackLockToggle: props.onTrackLockToggle,
      onTrackDelete: props.onTrackDelete,
      onTrackReorder: props.onTrackReorder,
      onReverseItems: props.onReverseItems,
    };

    const next = {
      tracks: props.tracks,
      selectedItemIds: props.selectedItemIds,
      currentFrame: props.currentFrame,
      fps: props.fps,
      isPlaying: props.isPlaying,
      canUndo: props.canUndo,
      canRedo: props.canRedo,
      playbackRate: props.playbackRate,
      clipTransitions: props.clipTransitions,
      transitionPickerFor: props.transitionPickerFor,
      trackLocks: props.trackLocks,
    };
    const current = useTimelineStore.getState();
    const changed: Partial<typeof next> = {};
    let hasChanges = false;
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (!Object.is(current[key], next[key])) {
        (changed as Record<string, unknown>)[key] = next[key];
        hasChanges = true;
      }
    }
    if (hasChanges) useTimelineStore.setState(changed);
  });

  useTimelineShortcuts();

  const pxPerSec = useZoomStore((s) => s.pxPerSec);
  const trimTooltip = useTimelineStore((s) => s.trimTooltip);
  const { numTracks } = useTimelineTracks(tracks);
  const timelineH = RULER_H + numTracks * CLIP_TRACK_H + HEADER_H;

  return (
    <>
      <div
        className="shrink-0 border-t border-white/8 bg-black/25 backdrop-blur-md flex flex-col overflow-hidden"
        style={{ height: collapsed ? 0 : timelineH, transition: "height 200ms ease" }}
      >
        <TimelineHeader totalDuration={totalDuration} collapsed={collapsed} />
        <TimelineContent pxPerSec={pxPerSec} totalDuration={totalDuration} />
      </div>

      {trimTooltip && (
        <div
          className="fixed z-50 bg-gray-900/95 text-primary text-xs font-mono px-2 py-1 rounded shadow-xl border border-white/10 pointer-events-none -translate-x-1/2"
          style={{ left: trimTooltip.x, top: trimTooltip.y - 32 }}
        >
          {trimTooltip.time.toFixed(2)}s
        </div>
      )}
    </>
  );
}
