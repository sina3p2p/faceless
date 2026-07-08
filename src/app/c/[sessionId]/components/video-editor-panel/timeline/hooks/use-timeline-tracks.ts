import { useMemo } from "react";
import type { TimelineTrack } from "../types";
import { MAX_TRACKS } from "../constants";
import { useTimelineStore } from "../stores/use-timeline-store";

export function trackIndexOf(trackId: string): number {
  return Number(trackId.replace("track-", "")) || 0;
}

export function trackIdOf(trackIndex: number): string {
  return `track-${trackIndex}`;
}

export function nextFreeTrackIndex(usedIndices: Iterable<number>): number {
  const used = new Set(usedIndices);
  let i = 0;
  while (used.has(i)) i++;
  return i;
}

export function findItem(tracks: TimelineTrack[], itemId: string) {
  for (const track of tracks) {
    const item = track.items.find((it) => it.id === itemId);
    if (item) return item;
  }
  return null;
}

// Rows to render: at least 3, and always a couple of empty rows past the
// last one in use (as drop targets), capped at MAX_TRACKS.
export function useTimelineTracks(tracks: TimelineTrack[]) {
  const numTracks = useMemo(
    () => Math.min(MAX_TRACKS, Math.max(3, ...tracks.map((t) => trackIndexOf(t.id) + 2))),
    [tracks],
  );
  return { numTracks };
}

// The single item considered "active" at the current playhead position: of
// all items covering that time, the one on the lowest (topmost) track.
export function useActiveItemId(): string | null {
  const tracks = useTimelineStore((s) => s.tracks);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const fps = useTimelineStore((s) => s.fps);
  return useMemo(() => {
    const t = currentFrame / fps;
    let bestId: string | null = null;
    let bestTrackIndex = Infinity;
    for (const track of tracks) {
      const idx = trackIndexOf(track.id);
      for (const item of track.items) {
        if (t >= item.start && t < item.end && idx < bestTrackIndex) {
          bestId = item.id;
          bestTrackIndex = idx;
        }
      }
    }
    return bestId;
  }, [tracks, currentFrame, fps]);
}
