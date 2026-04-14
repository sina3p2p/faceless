import { describe, expect, it } from "vitest";
import type { FrameSpec, VisualStyleGuide } from "@/lib/types";
import {
  buildUpstreamFallbackImagePrompt,
  mergeImageSpecWithUpstreamSubject,
  serializeFrameImageSpec,
  type ImageSpec,
} from "./image-spec";

const styleGuide: VisualStyleGuide = {
  global: {
    medium: "claymation",
    materialLanguage: "clay",
    colorPalette: ["blue", "white", "charcoal"],
    cameraPhysics: "locked",
    defaultLighting: "soft key",
  },
  promptRegions: {
    subjectPrefix: "Clay figure:",
    cameraPrefix: "Wide lens:",
    lightingPrefix: "Soft light:",
    backgroundPrefix: "Minimal set:",
  },
  perScene: [
    {
      sceneIndex: 0,
      lightingOverride: "warm side light",
      paletteOverride: ["blue", "white"],
      environmentMood: "tense",
    },
  ],
};

const frameSpec: FrameSpec = {
  clipDuration: 3,
  shotType: "medium",
  narrativeIntent: "build",
  motionPolicy: "moderate",
  transitionIn: "cut",
  subjectFocus: "Tommy",
  pacingNote: "",
};

describe("serializeFrameImageSpec", () => {
  it("is deterministic for the same inputs (why: canonical prompt must be stable)", () => {
    const spec: ImageSpec = {
      subject: { primary: "Tommy", focus: "face" },
      action: "leans forward",
      lighting: { key: "rim" },
    };
    const merged = mergeImageSpecWithUpstreamSubject(spec, "Tommy");
    const a = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    const b = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    expect(a).toBe(b);
    expect(a).toContain("Clay figure:");
    expect(a).toContain("medium");
    expect(a).toContain("Tommy");
  });

  it("injects Avoid line when negativeCues present", () => {
    const spec: ImageSpec = {
      subject: { primary: "X" },
      negativeCues: ["text overlays", "logos"],
    };
    const merged = mergeImageSpecWithUpstreamSubject(spec, "X");
    const s = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    expect(s).toContain("Avoid:");
    expect(s).toContain("text overlays");
  });
});

describe("mergeImageSpecWithUpstreamSubject", () => {
  it("replaces primary with upstream identity", () => {
    const spec: ImageSpec = { subject: { primary: "wrong" } };
    const m = mergeImageSpecWithUpstreamSubject(spec, "Tommy");
    expect(m.subject.primary).toBe("Tommy");
  });
});

describe("buildUpstreamFallbackImagePrompt", () => {
  it("is boring and includes locked shot type (why: fallback excludes architect flourish)", () => {
    const s = buildUpstreamFallbackImagePrompt({
      styleGuide,
      sceneIndex: 0,
      frameSpec,
      subjectPrimaryLine: "Tommy",
    });
    expect(s).toContain("Tommy");
    expect(s).toContain("medium");
    expect(s).toContain("Clay figure:");
    expect(s).not.toContain("leans");
  });
});
