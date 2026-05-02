import type { WordTimestamp } from "@/types/tts";

/**
 * Per-frame voiceover tempo (words per second).
 *
 * Computes the WPS over the time window `[frameStartS, frameStartS + frameDurationS)`
 * by counting word timestamps whose `start` falls inside it. Used by the
 * Motion Director to inverse-correlate motion intensity with VO density:
 * dense narration → simpler motion (audio is doing the work); sparse
 * narration → richer camera/subject motion to keep the frame alive.
 *
 * Returns 0 when `captionData` is missing/empty (typical for music videos)
 * or when `frameDurationS <= 0`.
 */
export function computeFrameWps(
  captionData: WordTimestamp[] | null | undefined,
  frameStartS: number,
  frameDurationS: number
): number {
  if (!captionData || captionData.length === 0) return 0;
  if (frameDurationS <= 0) return 0;

  const end = frameStartS + frameDurationS;
  let count = 0;
  for (const w of captionData) {
    if (w.start >= frameStartS && w.start < end) count++;
  }
  return count / frameDurationS;
}
