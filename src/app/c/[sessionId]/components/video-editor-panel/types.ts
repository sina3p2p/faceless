// Shared clip/transition shapes — used by both the editor (index.tsx, which
// owns this state) and the Timeline UI (timeline.tsx, which renders it).

export type InternalClip = {
  id: string;
  sourceId: string;
  videoUrl: string;
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
