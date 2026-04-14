import { describe, expect, it } from "vitest";
import { compileMotionPrompt } from "./motion";

describe("compileMotionPrompt", () => {
  it("joins fields with Camera/Ending/Avoid labels and trims whitespace", () => {
    const s = compileMotionPrompt({
      primaryAction: "She turns her head left.",
      subjectDynamics: "Hair swings; coat settles.",
      cameraMove: "slow pan left",
      endState: "Face in profile, camera still.",
      negativeMotion: "no second action, no morphing",
    });
    expect(s).toContain("She turns her head left.");
    expect(s).toContain("Hair swings; coat settles.");
    expect(s).toContain("Camera: slow pan left");
    expect(s).toContain("Ending: Face in profile, camera still.");
    expect(s).toContain("Avoid: no second action, no morphing");
    expect(s).not.toMatch(/\s{2,}/);
  });

  it("omits empty segments", () => {
    expect(
      compileMotionPrompt({
        primaryAction: "  Walks forward.  ",
        cameraMove: "",
        subjectDynamics: "",
        endState: "",
        negativeMotion: "",
      })
    ).toBe("Walks forward.");
  });
});
