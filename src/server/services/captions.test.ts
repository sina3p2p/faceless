import { describe, expect, it } from "vitest";
import { groupWordsByPauses } from "./captions";
import type { WordTimestamp } from "@/types/tts";

const w = (word: string, start: number, end: number): WordTimestamp => ({ word, start, end });

describe("groupWordsByPauses", () => {
  it("returns empty for empty input", () => {
    expect(groupWordsByPauses([])).toEqual([]);
  });

  it("splits on a clear pause", () => {
    const words = [
      w("Hello", 0.0, 0.3),
      w("world", 0.31, 0.6),
      // 400ms pause
      w("how", 1.0, 1.2),
      w("are", 1.21, 1.35),
      w("you", 1.36, 1.5),
    ];
    const groups = groupWordsByPauses(words);
    expect(groups).toHaveLength(2);
    expect(groups[0].text).toBe("Hello world");
    expect(groups[1].text).toBe("how are you");
  });

  it("splits on sentence-ending punctuation", () => {
    const words = [
      w("Hello.", 0.0, 0.3),
      w("World", 0.31, 0.5),
    ];
    const groups = groupWordsByPauses(words);
    expect(groups).toHaveLength(2);
    expect(groups[0].text).toBe("Hello.");
    expect(groups[1].text).toBe("World");
  });

  it("caps groups at the max words per group", () => {
    const words = Array.from({ length: 13 }, (_, i) =>
      w(`w${i}`, i * 0.1, i * 0.1 + 0.05)
    );
    // No pauses, no punctuation — but synthetic-uniform check should NOT trigger
    // because gaps are ~50ms (below threshold). Fallback to fixed-3 grouping.
    const groups = groupWordsByPauses(words);
    // Fallback path: 13 words / 3 per group = 5 groups (3,3,3,3,1)
    expect(groups).toHaveLength(5);
    expect(groups[0].text.split(" ")).toHaveLength(3);
    expect(groups.at(-1)!.text.split(" ")).toHaveLength(1);
  });

  it("respects max words even with real pauses", () => {
    const words: WordTimestamp[] = [];
    for (let i = 0; i < 8; i++) {
      // Tight gaps (~10ms) so no pause-based split kicks in.
      words.push(w(`w${i}`, i * 0.2, i * 0.2 + 0.18));
    }
    const groups = groupWordsByPauses(words);
    // Even though there's a real-looking gap (190ms ≥ 180ms) at every boundary,
    // we still expect grouping to cap at 6 words per group.
    for (const g of groups) {
      expect(g.text.split(" ").length).toBeLessThanOrEqual(6);
    }
  });

  it("preserves start/end timestamps from first/last word in a group", () => {
    const words = [
      w("Alpha", 0.10, 0.40),
      w("Beta.", 0.41, 0.70),
      w("Gamma", 1.20, 1.50),
    ];
    const groups = groupWordsByPauses(words);
    expect(groups[0]).toMatchObject({ text: "Alpha Beta.", start: 0.10, end: 0.70 });
    expect(groups[1]).toMatchObject({ text: "Gamma", start: 1.20, end: 1.50 });
  });
});
