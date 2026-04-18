import { describe, expect, it } from "vitest";
import type { FrameSpec, VisualStyleGuide } from "@/types/pipeline";
import {
  buildUpstreamFallbackImagePrompt,
  mergeImageSpecWithUpstream,
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
    const { spec: merged } = mergeImageSpecWithUpstream(spec, "Tommy", { assetRef: null });
    const a = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    const b = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    expect(a).toBe(b);
    expect(a).toContain("Clay figure:");
    expect(a).toContain("medium");
    expect(a).toContain("Tommy");
  });

  it("single MEDIUM line when spec.style.medium matches global (no duplicate medium prose)", () => {
    const spec: ImageSpec = {
      subject: { primary: "X" },
      style: { medium: "claymation", material: "sculpted clay" },
    };
    const { spec: merged } = mergeImageSpecWithUpstream(spec, "X", { assetRef: null });
    const s = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    const mediumCount = (s.match(/MEDIUM:/g) ?? []).length;
    expect(mediumCount).toBe(1);
    expect(s).toContain("Material: sculpted clay");
  });

  it("injects Avoid line when negativeCues present", () => {
    const spec: ImageSpec = {
      subject: { primary: "X" },
      negativeCues: ["text overlays", "logos"],
    };
    const { spec: merged } = mergeImageSpecWithUpstream(spec, "X", { assetRef: null });
    const s = serializeFrameImageSpec({ spec: merged, styleGuide, sceneIndex: 0, frameSpec });
    expect(s).toContain("Avoid:");
    expect(s).toContain("text overlays");
  });
});

describe("mergeImageSpecWithUpstream", () => {
  it("replaces primary and records lock code", () => {
    const spec: ImageSpec = { subject: { primary: "wrong" } };
    const { spec: m, mergeReasonCodes } = mergeImageSpecWithUpstream(spec, "Tommy", { assetRef: null });
    expect(m.subject.primary).toBe("Tommy");
    expect(mergeReasonCodes).toContain("MERGE_SUBJECT_PRIMARY_LOCKED");
  });

  it("trims secondary to 2", () => {
    const spec: ImageSpec = {
      subject: { primary: "A", secondary: ["b", "c", "d", "e"] },
    };
    const { spec: m, mergeReasonCodes } = mergeImageSpecWithUpstream(spec, "A", { assetRef: null });
    expect(m.subject.secondary).toEqual(["b", "c"]);
    expect(mergeReasonCodes).toContain("MERGE_SUBJECT_SECONDARY_TRIMMED");
  });

  it("strips focus with appearance pile when assetRef", () => {
    const spec: ImageSpec = {
      subject: { primary: "Tommy", focus: "young boy in frame" },
    };
    const { spec: m, mergeReasonCodes } = mergeImageSpecWithUpstream(spec, "Tommy", { assetRef: "r1" });
    expect(m.subject.focus).toBeUndefined();
    expect(mergeReasonCodes).toContain("MERGE_SUBJECT_FOCUS_STRIPPED_REF_ASSET");
  });
});

describe("mergeImageSpecWithUpstreamSubject (compat)", () => {
  it("returns spec only", () => {
    const spec: ImageSpec = { subject: { primary: "wrong" } };
    expect(mergeImageSpecWithUpstreamSubject(spec, "Tommy").subject.primary).toBe("Tommy");
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
