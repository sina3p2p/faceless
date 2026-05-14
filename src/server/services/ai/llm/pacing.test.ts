import { describe, it, expect } from "vitest";
import {
  WORDS_PER_SECOND,
  WPM_BY_PACE,
  estimateDurationSec,
  countNarrationWords,
  translatePauseMarkersToSsml,
  stripPauseMarkers,
} from "./pacing";

describe("pacing", () => {
  it("WORDS_PER_SECOND matches the standard WPM bucket", () => {
    expect(WORDS_PER_SECOND).toBe(2.5);
    expect(WPM_BY_PACE.standard / 60).toBeCloseTo(WORDS_PER_SECOND, 5);
  });

  describe("estimateDurationSec", () => {
    it("returns 0 for empty input", () => {
      expect(estimateDurationSec(0)).toBe(0);
      expect(estimateDurationSec(-5)).toBe(0);
    });

    it("uses the standard bucket by default (150 wpm)", () => {
      expect(estimateDurationSec(75)).toBe(30);
    });

    it("scales with pace", () => {
      const fast = estimateDurationSec(180, "fast");
      const standard = estimateDurationSec(180, "standard");
      const slow = estimateDurationSec(180, "slow");
      expect(fast).toBeLessThan(standard);
      expect(standard).toBeLessThan(slow);
      expect(fast).toBe(60);
      expect(slow).toBe(108);
    });

    it("rounds to one decimal place", () => {
      const result = estimateDurationSec(17, "standard");
      const decimals = result.toString().split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(1);
    });
  });

  describe("countNarrationWords", () => {
    it("counts plain words", () => {
      expect(countNarrationWords("one two three")).toBe(3);
    });

    it("ignores pause markers", () => {
      expect(countNarrationWords("hello [pause:0.5] world")).toBe(2);
      expect(countNarrationWords("[pause:1] one [pause:0.8] two")).toBe(2);
    });

    it("handles whitespace variations", () => {
      expect(countNarrationWords("  hello\nworld\t!\n\n")).toBe(3);
    });

    it("returns 0 for empty or pause-only text", () => {
      expect(countNarrationWords("")).toBe(0);
      expect(countNarrationWords("   ")).toBe(0);
      expect(countNarrationWords("[pause:1.0]")).toBe(0);
    });
  });

  describe("translatePauseMarkersToSsml", () => {
    it("replaces a single marker", () => {
      expect(translatePauseMarkersToSsml("hello [pause:0.8] world")).toBe(
        'hello <break time="0.8s"/> world'
      );
    });

    it("handles integer seconds and whitespace", () => {
      expect(translatePauseMarkersToSsml("a [pause: 1 ] b")).toBe(
        'a <break time="1s"/> b'
      );
    });

    it("clamps values outside the safe range", () => {
      expect(translatePauseMarkersToSsml("a [pause:10] b")).toBe(
        'a <break time="3s"/> b'
      );
      expect(translatePauseMarkersToSsml("a [pause:0.05] b")).toBe(
        'a <break time="0.1s"/> b'
      );
    });

    it("drops malformed / non-positive markers", () => {
      expect(translatePauseMarkersToSsml("a [pause:0] b")).toBe("a  b");
      expect(translatePauseMarkersToSsml("a [pause:-1] b")).toBe("a  b");
    });

    it("replaces multiple markers", () => {
      expect(
        translatePauseMarkersToSsml("[pause:0.5] one [pause:1.2] two")
      ).toBe('<break time="0.5s"/> one <break time="1.2s"/> two');
    });

    it("leaves text without markers unchanged", () => {
      expect(translatePauseMarkersToSsml("nothing here")).toBe("nothing here");
    });
  });

  describe("stripPauseMarkers", () => {
    it("removes markers and collapses whitespace", () => {
      expect(stripPauseMarkers("hello   [pause:1]   world")).toBe(
        "hello world"
      );
    });
  });
});
