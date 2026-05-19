import { describe, it, expect } from "vitest";
import {
  resolveSteps,
  firstJob,
  nextStep,
  stepAfterGate,
  isPipelineJob,
  resolveVideoType,
  type PipelineCtx,
} from "./topology";

const ctx = (overrides: Partial<PipelineCtx> = {}): PipelineCtx => ({
  videoType: "standalone",
  config: {},
  ...overrides,
});

describe("resolveVideoType", () => {
  it("passes through known types", () => {
    expect(resolveVideoType("movie")).toBe("movie");
    expect(resolveVideoType("music_video")).toBe("music_video");
    expect(resolveVideoType("timelapse")).toBe("timelapse");
  });
  it("defaults unknown/empty to standalone", () => {
    expect(resolveVideoType(null)).toBe("standalone");
    expect(resolveVideoType("")).toBe("standalone");
    expect(resolveVideoType("podcast")).toBe("standalone");
  });
});

describe("topology — standalone/movie/music share one graph", () => {
  it("standalone sequence (no web research)", () => {
    expect(resolveSteps(ctx()).map((s) => s.name)).toEqual([
      "executive-produce",
      "generate-story",
      "split-scenes",
      "supervise-script",
      "generate-tts",
      "cinematography",
      "extract-hero-assets",
      "storyboard",
      "generate-prompts",
      "generate-frame-images",
      "generate-pipeline-motion",
      "generate-frame-videos",
      "compose-final",
    ]);
  });

  it("includes web-research only when config.webResearch is true", () => {
    const withResearch = resolveSteps(ctx({ config: { webResearch: true } }));
    expect(withResearch[1].name).toBe("web-research");
    expect(resolveSteps(ctx()).some((s) => s.name === "web-research")).toBe(false);
  });

  it("movie and music_video are topologically identical to standalone", () => {
    const base = resolveSteps(ctx()).map((s) => s.name);
    expect(resolveSteps(ctx({ videoType: "movie" })).map((s) => s.name)).toEqual(base);
    expect(resolveSteps(ctx({ videoType: "music_video" })).map((s) => s.name)).toEqual(base);
  });
});

describe("topology — timelapse slim pipeline", () => {
  it("starts at timelapse-plan and skips brief/story/motion entirely", () => {
    expect(resolveSteps(ctx({ videoType: "timelapse" })).map((s) => s.name)).toEqual([
      "timelapse-plan",
      "generate-tts",
      "generate-frame-images",
      "generate-frame-videos",
      "compose-final",
    ]);
  });

  it("does not include executive-produce", () => {
    expect(
      resolveSteps(ctx({ videoType: "timelapse" })).some((s) => s.name === "executive-produce")
    ).toBe(false);
  });

  it("routes timelapse-plan → generate-tts", () => {
    expect(nextStep(ctx({ videoType: "timelapse" }), "timelapse-plan")).toEqual({
      kind: "enqueue",
      job: "generate-tts",
    });
  });
});

describe("nextStep — gates", () => {
  it("manual mode pauses at a gate (supervise-script → REVIEW_STORY)", () => {
    expect(nextStep(ctx(), "supervise-script")).toEqual({
      kind: "review",
      status: "REVIEW_STORY",
    });
  });

  it("auto mode chains straight through a gate", () => {
    expect(
      nextStep(ctx({ config: { pipelineMode: "auto" } }), "supervise-script")
    ).toEqual({ kind: "enqueue", job: "generate-tts" });
  });

  it("non-gated transitions always enqueue the next step", () => {
    expect(nextStep(ctx(), "generate-tts")).toEqual({
      kind: "enqueue",
      job: "cinematography",
    });
  });

  it("hero-assets is now a soft gate (manual pauses, auto chains)", () => {
    expect(nextStep(ctx(), "extract-hero-assets")).toEqual({
      kind: "review",
      status: "REVIEW_HERO_ASSETS",
    });
    expect(
      nextStep(ctx({ config: { pipelineMode: "auto" } }), "extract-hero-assets")
    ).toEqual({ kind: "enqueue", job: "storyboard" });
  });

  it("compose-final is terminal", () => {
    expect(nextStep(ctx(), "compose-final")).toEqual({ kind: "done" });
  });
});

describe("stepAfterGate — review resume", () => {
  it("REVIEW_STORY resumes at generate-tts", () => {
    expect(stepAfterGate(ctx(), "REVIEW_STORY")).toBe("generate-tts");
  });

  it("REVIEW_IMAGES resumes at motion for standalone but skips it for timelapse", () => {
    expect(stepAfterGate(ctx(), "REVIEW_IMAGES")).toBe("generate-pipeline-motion");
    expect(stepAfterGate(ctx({ videoType: "timelapse" }), "REVIEW_IMAGES")).toBe(
      "generate-frame-videos"
    );
  });

  it("REVIEW_PRODUCTION resumes into the terminal compose-final step", () => {
    expect(stepAfterGate(ctx(), "REVIEW_PRODUCTION")).toBe("compose-final");
  });
});

describe("firstJob / isPipelineJob", () => {
  it("first job reflects the per-type pipeline (timelapse starts at the planner)", () => {
    expect(firstJob(ctx())).toBe("executive-produce");
    expect(firstJob(ctx({ videoType: "movie" }))).toBe("executive-produce");
    expect(firstJob(ctx({ videoType: "timelapse" }))).toBe("timelapse-plan");
  });

  it("recognizes pipeline jobs and rejects others", () => {
    expect(isPipelineJob("generate-tts")).toBe(true);
    expect(isPipelineJob("timelapse-plan")).toBe(true);
    expect(isPipelineJob("render-video")).toBe(false);
    expect(isPipelineJob("nonsense")).toBe(false);
  });
});
