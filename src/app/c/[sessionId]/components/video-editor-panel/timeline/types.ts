// Shared clip/transition shapes — used by both the editor (index.tsx, which
// owns this state) and the Timeline UI (which renders it).

export type InternalClip = {
  id: string;
  sourceId: string;
  videoUrl: string;
  filmstripUrl?: string;
  filmstripTiles?: number;
  approved?: boolean;
  startTime: number;   // absolute position on timeline (seconds)
  trackIndex: number;  // which row (0 = top/primary)
  trimStart: number;
  trimEnd: number | null;
  reversed: boolean;
};

export type AudioClip = {
  id: string;
  url: string;
  name: string;
  startTime: number;
  trackIndex: number;
  trimStart: number;
  trimEnd: number | null;
  rawDuration: number;
  volume: number;
};

export type TransitionType =
  | "cut"
  | "dissolve"
  | "fade-black"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "wipe-left"
  | "wipe-right";

export interface TransitionSetting {
  type: TransitionType;
  duration: number;
}

// ─── Timeline controlled-component contract ─────────────────────────────────
// Mirrors reactvideoeditor.com's <Timeline> props (tracks/items shape). `clip`
// carries the real data (InternalClip/AudioClip, owned by index.tsx); `start`/
// `end`/`label`/`color` are the generic fields the Timeline UI itself needs.

export interface VideoTimelineItem {
  id: string;
  trackId: string;
  start: number;
  end: number;
  type: "video";
  label: string;
  color: string;
  clip: InternalClip;
}

export interface AudioTimelineItem {
  id: string;
  trackId: string;
  start: number;
  end: number;
  type: "audio";
  label: string;
  color: string;
  clip: AudioClip;
}

export type TimelineItem = VideoTimelineItem | AudioTimelineItem;

export interface TimelineTrack {
  id: string;
  name: string;
  items: TimelineItem[];
}

// Input for onAddNewItem — no analog in the generic reference contract since
// sourcing new media (from the app's media library) is app-specific.
export type NewTimelineItemInput =
  | { type: "video"; videoUrl: string; id?: string; duration?: number }
  | { type: "audio"; url: string; name: string; rawDuration: number };
