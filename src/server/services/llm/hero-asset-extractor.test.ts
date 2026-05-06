import { describe, it, expect } from "vitest";
import {
  buildHeroAssetSheetPrompt,
  aspectRatioForHeroAsset,
} from "./hero-asset-extractor";
import type { VisualStyleGuide, HeroAssetPlanEntry } from "@/types/pipeline";

const styleGuide: VisualStyleGuide = {
  global: {
    medium: "photorealistic cinematic",
    materialLanguage: "weathered metal, matte fabric",
    colorPalette: ["#1a1a1a", "#c97a3a", "#e0d4b8"],
    cameraPhysics: "full cinematic range",
    defaultLighting: "soft diffused warm key",
  },
  promptRegions: {
    subjectPrefix: "",
    cameraPrefix: "",
    lightingPrefix: "",
    backgroundPrefix: "",
  },
  perScene: [],
};

function entry(type: HeroAssetPlanEntry["type"], name = "Subject"): HeroAssetPlanEntry {
  return {
    name,
    type,
    description: "desc",
    appearance: "appearance traits",
    sheetPromptHints: "specific framing hint",
    rationale: "why",
  };
}

describe("aspectRatioForHeroAsset", () => {
  it("uses portrait for characters", () => {
    expect(aspectRatioForHeroAsset("character")).toBe("9:16");
  });
  it("uses landscape for locations", () => {
    expect(aspectRatioForHeroAsset("location")).toBe("16:9");
  });
  it("uses square for props", () => {
    expect(aspectRatioForHeroAsset("prop")).toBe("1:1");
  });
});

describe("buildHeroAssetSheetPrompt", () => {
  it("includes the asset name and appearance", () => {
    const p = buildHeroAssetSheetPrompt(entry("character", "Elena"), styleGuide);
    expect(p).toContain("Elena");
    expect(p).toContain("appearance traits");
  });

  it("uses A-pose framing for characters", () => {
    const p = buildHeroAssetSheetPrompt(entry("character"), styleGuide);
    expect(p.toLowerCase()).toContain("a-pose");
    expect(p.toLowerCase()).toContain("plain neutral grey backdrop");
  });

  it("uses three-quarter hero framing for props (e.g. F-4 Phantom)", () => {
    const p = buildHeroAssetSheetPrompt(entry("prop", "F-4 Phantom (Bravo Six)"), styleGuide);
    expect(p).toContain("F-4 Phantom (Bravo Six)");
    expect(p.toLowerCase()).toContain("three-quarter");
    expect(p.toLowerCase()).toContain("no human figures");
  });

  it("uses establishing-shot framing for locations and excludes characters", () => {
    const p = buildHeroAssetSheetPrompt(entry("location", "Carrier deck"), styleGuide);
    expect(p.toLowerCase()).toContain("establishing");
    expect(p.toLowerCase()).toContain("no characters present");
  });

  it("injects style guide medium and palette", () => {
    const p = buildHeroAssetSheetPrompt(entry("character"), styleGuide);
    expect(p).toContain("photorealistic cinematic");
    expect(p).toContain("#c97a3a");
  });

  it("falls back to a default style hint when no guide is provided", () => {
    const p = buildHeroAssetSheetPrompt(entry("character"));
    expect(p.toLowerCase()).toContain("photorealistic");
  });

  it("preserves caller-provided sheet hints", () => {
    const e = entry("prop");
    e.sheetPromptHints = "rotate 30deg, dramatic backlight";
    const p = buildHeroAssetSheetPrompt(e, styleGuide);
    expect(p).toContain("rotate 30deg, dramatic backlight");
  });
});
