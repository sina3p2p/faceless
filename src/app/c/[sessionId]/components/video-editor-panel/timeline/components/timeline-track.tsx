"use client";

import { TimelineTrackHandle } from "./timeline-track-handles";
import { RULER_H, CLIP_TRACK_H } from "../constants";

// Background lane only — items are rendered as a flat sibling list in
// timeline-content.tsx (not nested per-track), so that an item moving
// between tracks is a style change, not an unmount/remount that would
// destroy an in-progress drag gesture (losing pointer capture mid-drag).
export function TimelineTrack({ trackIndex }: { trackIndex: number }) {
  const top = RULER_H + trackIndex * CLIP_TRACK_H;

  return (
    <div className="absolute left-0 right-0 border-b border-white/5" style={{ top, height: CLIP_TRACK_H }}>
      <TimelineTrackHandle trackIndex={trackIndex} />
    </div>
  );
}
