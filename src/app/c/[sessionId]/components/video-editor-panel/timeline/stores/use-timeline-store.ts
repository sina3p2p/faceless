import { create } from "zustand";
import type { NewTimelineItemInput, TimelineTrack, TransitionSetting } from "../types";

// Internal store for the Timeline module. `Timeline` is a controlled
// component — canonical data lives in the parent and arrives as props — so
// this store exists only to (a) mirror those props so deeply nested
// components (timeline-track, timeline-item, timeline-markers) can read them
// without threading props through every level, and (b) hold transient,
// UI-only interaction state that no one outside the Timeline needs to see
// (active drag, marquee rectangle, hover time, snap guide).
//
// Mirrored *data* is written via setState when identity/value changes.
// Mirrored *callbacks* live in a ref and are exposed as stable wrappers —
// parent handlers are almost always new function identities every render,
// and putting those into the store would re-notify every subscriber on
// every parent render (and, with useLayoutEffect sync, can spin into
// "Maximum update depth exceeded").

export interface MarqueeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface TimelineCallbacks {
  onTracksChange: (tracks: TimelineTrack[]) => void;
  onItemMove: (itemId: string, newStart: number, newEnd: number, newTrackId: string) => void;
  onItemResize: (itemId: string, newStart: number, newEnd: number) => void;
  onItemSelect: (itemId: string) => void;
  onSelectedItemsChange: (itemIds: string[]) => void;
  onDeleteItems: (itemIds: string[]) => void;
  onDuplicateItems: (itemIds: string[]) => void;
  onSplitItems: (itemId: string, splitTime: number) => void;
  onAddNewItem: (item: NewTimelineItemInput) => void;
  onFrameChange: (frame: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onUndo: () => void;
  onRedo: () => void;
  getRawDuration: (id: string) => number;
  setPlaybackRate: (rate: number) => void;
  onCollapsedChange: (collapsed: boolean) => void;
  onTransitionPickerChange: (clipId: string | null) => void;
  onTrackLockToggle: (trackIndex: number) => void;
  onTrackDelete: (trackIndex: number) => void;
  onTrackReorder: (fromIndex: number, toIndex: number) => void;
  onReverseItems: (itemIds: string[]) => void;
}

const noop = () => {};
const noopGetRaw = () => 0;

export const timelineCallbackRefs: { current: TimelineCallbacks } = {
  current: {
    onTracksChange: noop,
    onItemMove: noop,
    onItemResize: noop,
    onItemSelect: noop,
    onSelectedItemsChange: noop,
    onDeleteItems: noop,
    onDuplicateItems: noop,
    onSplitItems: noop,
    onAddNewItem: noop,
    onFrameChange: noop,
    onPlay: noop,
    onPause: noop,
    onUndo: noop,
    onRedo: noop,
    getRawDuration: noopGetRaw,
    setPlaybackRate: noop,
    onCollapsedChange: noop,
    onTransitionPickerChange: noop,
    onTrackLockToggle: noop,
    onTrackDelete: noop,
    onTrackReorder: noop,
    onReverseItems: noop,
  },
};

interface TimelineStoreState {
  // ── mirrored props (data only) ──
  tracks: TimelineTrack[];
  selectedItemIds: string[];
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  canUndo: boolean;
  canRedo: boolean;
  playbackRate: number;
  clipTransitions: Map<string, TransitionSetting>;
  transitionPickerFor: string | null;
  trackLocks: Set<number>;

  // ── stable callback wrappers (never replaced; read latest via refs) ──
  onTracksChange: TimelineCallbacks["onTracksChange"];
  onItemMove: TimelineCallbacks["onItemMove"];
  onItemResize: TimelineCallbacks["onItemResize"];
  onItemSelect: TimelineCallbacks["onItemSelect"];
  onSelectedItemsChange: TimelineCallbacks["onSelectedItemsChange"];
  onDeleteItems: TimelineCallbacks["onDeleteItems"];
  onDuplicateItems: TimelineCallbacks["onDuplicateItems"];
  onSplitItems: TimelineCallbacks["onSplitItems"];
  onAddNewItem: TimelineCallbacks["onAddNewItem"];
  onFrameChange: TimelineCallbacks["onFrameChange"];
  onPlay: TimelineCallbacks["onPlay"];
  onPause: TimelineCallbacks["onPause"];
  onUndo: TimelineCallbacks["onUndo"];
  onRedo: TimelineCallbacks["onRedo"];
  getRawDuration: TimelineCallbacks["getRawDuration"];
  setPlaybackRate: TimelineCallbacks["setPlaybackRate"];
  onCollapsedChange: TimelineCallbacks["onCollapsedChange"];
  onTransitionPickerChange: TimelineCallbacks["onTransitionPickerChange"];
  onTrackLockToggle: TimelineCallbacks["onTrackLockToggle"];
  onTrackDelete: TimelineCallbacks["onTrackDelete"];
  onTrackReorder: TimelineCallbacks["onTrackReorder"];
  onReverseItems: TimelineCallbacks["onReverseItems"];

  // ── transient, internal-only ──
  draggingItemId: string | null;
  draggingTrackIndex: number | null;
  trackDropTarget: number | null;
  marqueeRect: MarqueeRect | null;
  hoverTime: number | null;
  snapGuide: number | null;
  trimTooltip: { x: number; y: number; time: number } | null;
  setDraggingItemId: (id: string | null) => void;
  setDraggingTrackIndex: (index: number | null) => void;
  setTrackDropTarget: (index: number | null) => void;
  setMarqueeRect: (rect: MarqueeRect | null) => void;
  setHoverTime: (t: number | null) => void;
  setSnapGuide: (t: number | null) => void;
  setTrimTooltip: (v: { x: number; y: number; time: number } | null) => void;
}

export const useTimelineStore = create<TimelineStoreState>((set) => ({
  tracks: [],
  selectedItemIds: [],
  currentFrame: 0,
  fps: 30,
  isPlaying: false,
  canUndo: false,
  canRedo: false,
  playbackRate: 1,
  clipTransitions: new Map(),
  transitionPickerFor: null,
  trackLocks: new Set(),

  onTracksChange: (...args) => timelineCallbackRefs.current.onTracksChange(...args),
  onItemMove: (...args) => timelineCallbackRefs.current.onItemMove(...args),
  onItemResize: (...args) => timelineCallbackRefs.current.onItemResize(...args),
  onItemSelect: (...args) => timelineCallbackRefs.current.onItemSelect(...args),
  onSelectedItemsChange: (...args) => timelineCallbackRefs.current.onSelectedItemsChange(...args),
  onDeleteItems: (...args) => timelineCallbackRefs.current.onDeleteItems(...args),
  onDuplicateItems: (...args) => timelineCallbackRefs.current.onDuplicateItems(...args),
  onSplitItems: (...args) => timelineCallbackRefs.current.onSplitItems(...args),
  onAddNewItem: (...args) => timelineCallbackRefs.current.onAddNewItem(...args),
  onFrameChange: (...args) => timelineCallbackRefs.current.onFrameChange(...args),
  onPlay: (...args) => timelineCallbackRefs.current.onPlay(...args),
  onPause: (...args) => timelineCallbackRefs.current.onPause(...args),
  onUndo: (...args) => timelineCallbackRefs.current.onUndo(...args),
  onRedo: (...args) => timelineCallbackRefs.current.onRedo(...args),
  getRawDuration: (...args) => timelineCallbackRefs.current.getRawDuration(...args),
  setPlaybackRate: (...args) => timelineCallbackRefs.current.setPlaybackRate(...args),
  onCollapsedChange: (...args) => timelineCallbackRefs.current.onCollapsedChange(...args),
  onTransitionPickerChange: (...args) => timelineCallbackRefs.current.onTransitionPickerChange(...args),
  onTrackLockToggle: (...args) => timelineCallbackRefs.current.onTrackLockToggle(...args),
  onTrackDelete: (...args) => timelineCallbackRefs.current.onTrackDelete(...args),
  onTrackReorder: (...args) => timelineCallbackRefs.current.onTrackReorder(...args),
  onReverseItems: (...args) => timelineCallbackRefs.current.onReverseItems(...args),

  draggingItemId: null,
  draggingTrackIndex: null,
  trackDropTarget: null,
  marqueeRect: null,
  hoverTime: null,
  snapGuide: null,
  trimTooltip: null,
  setDraggingItemId: (id) => set({ draggingItemId: id }),
  setDraggingTrackIndex: (index) => set({ draggingTrackIndex: index }),
  setTrackDropTarget: (index) => set({ trackDropTarget: index }),
  setMarqueeRect: (rect) => set({ marqueeRect: rect }),
  setHoverTime: (t) => set({ hoverTime: t }),
  setSnapGuide: (t) => set({ snapGuide: t }),
  setTrimTooltip: (v) => set({ trimTooltip: v }),
}));
