/**
 * Pick the best API duration for the requested scene duration.
 * If the model supports the exact value, use it.
 * Otherwise pick the closest supported value that is >= requested (so the
 * composer can trim rather than stretch). Falls back to the largest available.
 */
export function pickBestDuration(requested: number, supported: readonly number[]): number {
  if (supported.includes(requested)) return requested;
  const candidates = supported.filter((d) => d >= requested);
  if (candidates.length > 0) return Math.min(...candidates);
  return Math.max(...supported);
}
