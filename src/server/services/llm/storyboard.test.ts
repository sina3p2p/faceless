import { describe, expect, it } from "vitest";
import { validateShotBudget } from "./storyboard";
import type { FrameBreakdown, FrameSpec, ShotType } from "@/types/pipeline";

const frame = (shotType: ShotType): FrameSpec => ({
  clipDuration: 5,
  shotType,
  narrativeIntent: "build",
  motionPolicy: "moderate",
  transitionIn: "cut",
  subjectFocus: "subject",
  pacingNote: "",
});

const scene = (...shots: ShotType[]): { frames: FrameSpec[] } => ({
  frames: shots.map(frame),
});

const bk = (...scenes: { frames: FrameSpec[] }[]): FrameBreakdown => ({ scenes });

describe("validateShotBudget", () => {
  it("passes a well-varied breakdown", () => {
    const breakdown = bk(
      scene("establishing", "medium", "close-up"),
      scene("wide", "over-shoulder", "detail")
    );
    expect(validateShotBudget(breakdown)).toEqual([]);
  });

  it("flags a 3+ frame scene with no establishing/wide", () => {
    const breakdown = bk(scene("medium", "close-up", "over-shoulder"));
    const v = validateShotBudget(breakdown);
    expect(v.some((m) => m.includes("scene 0"))).toBe(true);
  });

  it("ignores the establishing/wide rule for short scenes (<3 frames)", () => {
    const breakdown = bk(scene("medium", "close-up"));
    expect(validateShotBudget(breakdown)).toEqual([]);
  });

  it("flags a 5-frame stretch with no close-up/detail", () => {
    const breakdown = bk(scene("establishing", "wide", "medium", "over-shoulder", "wide"));
    const v = validateShotBudget(breakdown);
    expect(v.some((m) => m.includes("no close-up/detail"))).toBe(true);
  });

  it("flags 3 consecutive medium shots", () => {
    const breakdown = bk(scene("establishing", "medium", "medium", "medium", "close-up"));
    const v = validateShotBudget(breakdown);
    expect(v.some((m) => m.includes("three consecutive medium"))).toBe(true);
  });

  it("does not flag exactly 2 consecutive medium shots", () => {
    const breakdown = bk(scene("establishing", "medium", "medium", "close-up"));
    const v = validateShotBudget(breakdown);
    expect(v.some((m) => m.includes("consecutive medium"))).toBe(false);
  });

  it("counts close-up across scene boundaries (flat global window)", () => {
    const breakdown = bk(
      scene("wide", "medium"),
      scene("close-up", "medium", "wide")
    );
    expect(validateShotBudget(breakdown)).toEqual([]);
  });

  it("emits one violation per failing 5-window when the run is long", () => {
    const breakdown = bk(scene("medium", "wide", "medium", "wide", "medium", "wide", "medium"));
    const v = validateShotBudget(breakdown);
    const closeViolations = v.filter((m) => m.includes("no close-up/detail"));
    expect(closeViolations.length).toBeGreaterThanOrEqual(2);
  });
});
