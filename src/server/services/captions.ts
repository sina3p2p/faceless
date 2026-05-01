import type { WordTimestamp } from "@/types/tts";

/**
 * Caption grouping driven by voiceover word timestamps.
 *
 * Splits captions on:
 *   - sentence-ending punctuation (.,!?;:…)
 *   - inter-word pauses ≥ PAUSE_THRESHOLD_S
 *   - reaching MAX_WORDS_PER_GROUP
 *
 * Falls back to fixed-N grouping when no real pauses or punctuation are
 * present (i.e. timestamps were synthesized from a duration estimate).
 */

export const CAPTION_PAUSE_THRESHOLD_S = 0.18;
export const CAPTION_MAX_WORDS_PER_GROUP = 6;
export const CAPTION_FALLBACK_GROUP_SIZE = 3;
const SENTENCE_END_RE = /[.!?…,;:](["'”’»)\]]+)?$/u;

export interface CaptionGroup {
  text: string;
  start: number;
  end: number;
}

export function fixedSizeGroups(words: WordTimestamp[], wordsPerGroup: number): CaptionGroup[] {
  const groups: CaptionGroup[] = [];
  for (let i = 0; i < words.length; i += wordsPerGroup) {
    const chunk = words.slice(i, i + wordsPerGroup);
    groups.push({
      text: chunk.map((w) => w.word).join(" "),
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
    });
  }
  return groups;
}

export function groupWordsByPauses(words: WordTimestamp[]): CaptionGroup[] {
  if (words.length === 0) return [];

  let hasRealGap = false;
  for (let i = 1; i < words.length; i++) {
    if (words[i].start - words[i - 1].end >= CAPTION_PAUSE_THRESHOLD_S) {
      hasRealGap = true;
      break;
    }
  }
  if (!hasRealGap && !words.some((w) => SENTENCE_END_RE.test(w.word))) {
    return fixedSizeGroups(words, CAPTION_FALLBACK_GROUP_SIZE);
  }

  const groups: CaptionGroup[] = [];
  let bucket: WordTimestamp[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    groups.push({
      text: bucket.map((w) => w.word).join(" "),
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
    });
    bucket = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    bucket.push(word);

    const next = words[i + 1];
    const gapToNext = next ? next.start - word.end : Infinity;
    const endsOnPunctuation = SENTENCE_END_RE.test(word.word);
    const reachedMax = bucket.length >= CAPTION_MAX_WORDS_PER_GROUP;

    if (!next || endsOnPunctuation || gapToNext >= CAPTION_PAUSE_THRESHOLD_S || reachedMax) {
      flush();
    }
  }
  flush();
  return groups;
}
