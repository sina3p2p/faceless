import { describe, expect, it } from "vitest";
import { computeFrameWps } from "./frame-tempo";
import type { WordTimestamp } from "@/types/tts";

const w = (word: string, start: number, end: number): WordTimestamp => ({ word, start, end });

describe("computeFrameWps", () => {
  it("returns 0 for null/empty captionData", () => {
    expect(computeFrameWps(null, 0, 5)).toBe(0);
    expect(computeFrameWps(undefined, 0, 5)).toBe(0);
    expect(computeFrameWps([], 0, 5)).toBe(0);
  });

  it("returns 0 for non-positive durations", () => {
    expect(computeFrameWps([w("a", 0, 0.1)], 0, 0)).toBe(0);
    expect(computeFrameWps([w("a", 0, 0.1)], 0, -1)).toBe(0);
  });

  it("counts words whose start falls in [start, start+duration)", () => {
    const cd = [
      w("zero", 0.0, 0.4),
      w("one", 0.5, 0.9),
      w("two", 1.0, 1.4),
      w("three", 1.5, 1.9),
    ];
    // window [0.0, 1.0) → counts zero and one (start=0.0, 0.5)
    expect(computeFrameWps(cd, 0.0, 1.0)).toBeCloseTo(2.0, 5);
  });

  it("excludes words starting exactly at the right boundary", () => {
    const cd = [w("a", 0.0, 0.4), w("b", 1.0, 1.4)];
    // [0.0, 1.0) — 'b' starts at 1.0 which is excluded.
    expect(computeFrameWps(cd, 0.0, 1.0)).toBeCloseTo(1.0, 5);
  });

  it("includes words starting exactly at the left boundary", () => {
    const cd = [w("a", 1.0, 1.4)];
    expect(computeFrameWps(cd, 1.0, 1.0)).toBeCloseTo(1.0, 5);
  });

  it("normalizes by frame duration regardless of how many words exist", () => {
    const cd = Array.from({ length: 10 }, (_, i) => w(`w${i}`, i * 0.2, i * 0.2 + 0.18));
    // Frame [0, 2.0): all 10 words → wps = 5.0
    expect(computeFrameWps(cd, 0.0, 2.0)).toBeCloseTo(5.0, 5);
    // Frame [0, 1.0): 5 words → wps = 5.0
    expect(computeFrameWps(cd, 0.0, 1.0)).toBeCloseTo(5.0, 5);
  });
});
