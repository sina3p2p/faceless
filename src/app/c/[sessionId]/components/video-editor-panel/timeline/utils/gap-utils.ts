export interface Obstacle {
  start: number;
  end: number;
}

// Resolves same-track collisions during a drag: if the desired position
// overlaps an obstacle, snaps to whichever free edge (just before or just
// after it) is closest to the desired position. Different tracks can freely
// overlap — obstacles should already be filtered to the destination track.
export function resolveDropPosition(
  desiredStart: number,
  duration: number,
  obstacles: Obstacle[],
): { start: number; snapped: boolean } {
  if (duration <= 0) return { start: desiredStart, snapped: false };

  let resolvedStart = desiredStart;
  let snapped = false;
  const sorted = obstacles.filter((o) => o.end > o.start).sort((a, b) => a.start - b.start);

  for (const o of sorted) {
    if (resolvedStart < o.end && resolvedStart + duration > o.start) {
      const snapBefore = Math.max(0, o.start - duration);
      const snapAfter = o.end;
      resolvedStart =
        Math.abs(desiredStart - snapBefore) <= Math.abs(desiredStart - snapAfter) ? snapBefore : snapAfter;
      snapped = true;
    }
  }

  return { start: resolvedStart, snapped };
}
