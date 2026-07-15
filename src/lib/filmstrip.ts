/** Shared filmstrip sprite layout — server generates, client displays. */
export const FILMSTRIP_TILE_WIDTH = 160;

/** One frame per second of footage (clamped). Shots are 4–15s. */
export function filmstripTileCount(durationSeconds: number): number {
  return Math.max(1, Math.min(20, Math.round(Math.max(0.5, durationSeconds))));
}
