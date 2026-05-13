// Shared pacing constants and helpers used by the producer, director, and
// supervisor stages so the timeline math has one source of truth.

export const WORDS_PER_SECOND = 2.5;

export type VoicePace = "slow" | "standard" | "fast";

// Words per *minute* for each pace bucket. The standard bucket is anchored to
// the global WORDS_PER_SECOND (150 wpm = 2.5 wps) so existing budgets remain
// unchanged. Slow and fast are tuned per the PDF: 100 wpm for technical /
// educational delivery, ~180 wpm for high-energy promotional pacing.
export const WPM_BY_PACE: Record<VoicePace, number> = {
  slow: 100,
  standard: 150,
  fast: 180,
};

/**
 * Estimated narration duration in seconds for `wordCount` words at the
 * given pace. Rounded to one decimal place.
 */
export function estimateDurationSec(
  wordCount: number,
  pace: VoicePace = "standard"
): number {
  if (wordCount <= 0) return 0;
  const wpm = WPM_BY_PACE[pace];
  const seconds = (wordCount / wpm) * 60;
  return Math.round(seconds * 10) / 10;
}

/**
 * Word count helper that matches what the supervisor / TTS expect — split on
 * runs of whitespace and ignore empty tokens. Pause markers are stripped
 * first so they don't inflate the count.
 */
export function countNarrationWords(text: string): number {
  const stripped = text.replace(/\[pause:[^\]]*\]/gi, " ");
  return stripped
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0).length;
}

// ── SSML pause markers ──
// The pipeline uses a provider-agnostic bracket form `[pause:N]` (N in seconds,
// optionally decimal) in stored scene text. The TTS layer translates these to
// the provider's tag form just before sending. Keeping the bracket form in the
// DB means we can swap TTS providers without rewriting scenes.

// Matches `[pause:N]` with optional whitespace and signed/decimal numbers.
// We catch negative and zero values here too so we can drop them rather than
// leak them into TTS as spoken text.
const PAUSE_PATTERN = /\[pause:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*\]/gi;

/** Replace `[pause:N]` markers with ElevenLabs `<break time="Ns"/>` SSML. */
export function translatePauseMarkersToSsml(text: string): string {
  return text.replace(PAUSE_PATTERN, (_match, secs: string) => {
    const n = Number(secs);
    if (!Number.isFinite(n) || n <= 0) return "";
    // Clamp to ElevenLabs' practical range to avoid silent rejections.
    const clamped = Math.min(3, Math.max(0.1, n));
    return `<break time="${clamped}s"/>`;
  });
}

/** Strip pause markers entirely (for word-count / display contexts). */
export function stripPauseMarkers(text: string): string {
  return text.replace(PAUSE_PATTERN, " ").replace(/\s+/g, " ").trim();
}
