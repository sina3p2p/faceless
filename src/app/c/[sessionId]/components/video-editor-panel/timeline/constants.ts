export const RULER_H = 28;
export const CLIP_TRACK_H = 68;
export const HEADER_H = 44;
export const LABEL_W = 68;
export const MAX_TRACKS = 8;

/** Visible clip body height (track row minus vertical padding in VideoClip). */
export const CLIP_BODY_H = CLIP_TRACK_H - 8;

// Zoom: clip width = duration × pxPerSec. Default matches one 16:9 filmstrip
// cell per second so a 9s shot is ~9 readable frames wide.
export const MIN_PX_PER_SEC = 12;
export const MAX_PX_PER_SEC = 160;
export const DEFAULT_PX_PER_SEC = Math.round(CLIP_BODY_H * (16 / 9)); // ~107
