import { describe, expect, it } from "vitest";
import { compileMotionPrompt, type FrameMotionSpec } from "./motion";

const spec = (overrides: Partial<FrameMotionSpec> = {}): FrameMotionSpec => ({
  primaryAction: "subject leans forward",
  cameraMove: "slow push-in",
  subjectDynamics: "weight shifts to ball of foot, hair settles",
  endState: "subject upright, camera held",
  negativeMotion: "no morphing, no extra hands",
  ...overrides,
});

describe("compileMotionPrompt", () => {
  it("produces a prompt without secondaryAction by default", () => {
    const out = compileMotionPrompt(spec());
    expect(out).toContain("subject leans forward");
    expect(out).not.toContain("followed by");
    expect(out).toContain("Camera: slow push-in");
    expect(out).toContain("Ending: subject upright");
    expect(out).toContain("Avoid: no morphing");
  });

  it("splices secondaryAction with 'followed by' when present", () => {
    const out = compileMotionPrompt(spec({ secondaryAction: "head tilts in recognition" }));
    expect(out).toContain("subject leans forward; followed by head tilts in recognition");
  });

  it("ignores blank/whitespace secondaryAction", () => {
    expect(compileMotionPrompt(spec({ secondaryAction: "" }))).not.toContain("followed by");
    expect(compileMotionPrompt(spec({ secondaryAction: "   " }))).not.toContain("followed by");
  });

  it("falls back to secondaryAction-only if primaryAction is empty", () => {
    const out = compileMotionPrompt(
      spec({ primaryAction: "", secondaryAction: "head tilts in recognition" })
    );
    expect(out).toContain("head tilts in recognition");
    expect(out).not.toContain("followed by");
  });

  it("returns empty when every field is blank", () => {
    expect(
      compileMotionPrompt({
        primaryAction: "",
        cameraMove: "",
        subjectDynamics: "",
        endState: "",
        negativeMotion: "",
      })
    ).toBe("");
  });
});
