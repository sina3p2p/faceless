import { describe, expect, it } from "vitest";
import { buildXfadeFilterChain, sceneNeedsXfade } from "./xfade";

describe("sceneNeedsXfade", () => {
  it("returns false when every transition is cut/null", () => {
    expect(sceneNeedsXfade([null, "cut", "cut"])).toBe(false);
    expect(sceneNeedsXfade([null, null])).toBe(false);
  });

  it("ignores transitions[0] (first frame has no incoming)", () => {
    // dissolve at index 0 should NOT trigger xfade since frame 0 is the opening.
    expect(sceneNeedsXfade(["dissolve", "cut", "cut"])).toBe(false);
  });

  it("returns true when any non-first frame has a real transition", () => {
    expect(sceneNeedsXfade([null, "dissolve", "cut"])).toBe(true);
    expect(sceneNeedsXfade([null, "cut", "whip-pan"])).toBe(true);
  });
});

describe("buildXfadeFilterChain", () => {
  it("returns empty result for empty input", () => {
    const out = buildXfadeFilterChain([], []);
    expect(out.filter).toBe("");
    expect(out.effectiveTotalDuration).toBe(0);
  });

  it("handles a single clip without filters", () => {
    const out = buildXfadeFilterChain([5], [null]);
    expect(out.filter).toBe("");
    expect(out.effectiveTotalDuration).toBe(5);
    expect(out.outLabel).toBe("[0:v]");
  });

  it("computes correct offset and duration for a dissolve pair", () => {
    const out = buildXfadeFilterChain([5, 6], [null, "dissolve"]);
    // dissolve duration is 0.4; offset = 5 - 0.4 = 4.6
    expect(out.filter).toContain("xfade=transition=fade:duration=0.400:offset=4.600");
    // Effective: 5 + 6 - 0.4 = 10.6
    expect(out.effectiveTotalDuration).toBeCloseTo(10.6, 3);
    expect(out.outLabel).toBe("[v1]");
  });

  it("chains three clips with mixed transitions", () => {
    const out = buildXfadeFilterChain([5, 6, 4], [null, "dissolve", "whip-pan"]);
    // First xfade offset: 5 - 0.4 = 4.6, cumulative becomes 5 - 0.4 + 6 = 10.6
    // Second xfade offset: 10.6 - 0.25 = 10.35
    expect(out.filter).toContain("offset=4.600");
    expect(out.filter).toContain("transition=slideleft:duration=0.250:offset=10.350");
    // Effective total: 5 + 6 + 4 - 0.4 - 0.25 = 14.35
    expect(out.effectiveTotalDuration).toBeCloseTo(14.35, 3);
    expect(out.outLabel).toBe("[v2]");
  });

  it("treats cut transitions as zero-overlap joins", () => {
    const out = buildXfadeFilterChain([5, 5], [null, "cut"]);
    expect(out.filter).toContain("duration=0");
    expect(out.effectiveTotalDuration).toBe(10);
  });

  it("clamps negative offsets to 0 if a transition is longer than the prior clip", () => {
    // Pathological: clip is 0.2s but transition wants 0.5s.
    const out = buildXfadeFilterChain([0.2, 5], [null, "fade"]);
    expect(out.filter).toContain("offset=0.000");
  });

  it("throws when transitions and frameDurations lengths disagree", () => {
    expect(() => buildXfadeFilterChain([1, 2, 3], [null, "cut"])).toThrow(/mismatch/i);
  });

  it("maps every transition type to the documented xfade name", () => {
    const cases: Array<{ kind: "dissolve" | "fade" | "match-cut" | "whip-pan"; name: string }> = [
      { kind: "dissolve", name: "fade" },
      { kind: "fade", name: "fadeblack" },
      { kind: "match-cut", name: "fade" },
      { kind: "whip-pan", name: "slideleft" },
    ];
    for (const { kind, name } of cases) {
      const out = buildXfadeFilterChain([5, 5], [null, kind]);
      expect(out.filter).toContain(`transition=${name}`);
    }
  });
});
