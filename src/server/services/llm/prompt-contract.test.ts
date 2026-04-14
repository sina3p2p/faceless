import { describe, expect, it } from "vitest";
import type { CharacterEntry } from "@/lib/types";
import type { FrameSpec, VisualStyleGuide } from "@/lib/types";
import {
  assembleSubjectIdentityFromFrame,
  buildFramePromptContractAssessment,
  CONTRACT_VERSION,
  deriveFinalStatus,
  evaluateCanonicalPromptUsability,
  hasAppearanceRoleInjectionBeforeName,
  normalizeSubjectIdentity,
  resolveFrameImagePromptWithFallback,
  serializeCanonicalForImageProvider,
} from "./prompt-contract";

function mockCharacter(overrides: Partial<CharacterEntry> & Pick<CharacterEntry, "canonicalName">): CharacterEntry {
  return {
    aliases: [],
    assetRef: null,
    appearance: { clothing: "", hair: "", distinguishingFeatures: "" },
    firstScene: 0,
    presentInScenes: [0],
    ...overrides,
  };
}

describe("deriveFinalStatus", () => {
  it("failed when payload not usable", () => {
    expect(
      deriveFinalStatus({
        payloadUsable: false,
        fallbackUsed: false,
        fallbackAttempted: false,
        degraded: true,
        warningCodes: [],
      })
    ).toBe("failed");
  });

  it("fallback when usable and fallback used", () => {
    expect(
      deriveFinalStatus({
        payloadUsable: true,
        fallbackUsed: true,
        fallbackAttempted: true,
        degraded: false,
        warningCodes: [],
      })
    ).toBe("fallback");
  });

  it("degraded beats warned", () => {
    expect(
      deriveFinalStatus({
        payloadUsable: true,
        fallbackUsed: false,
        fallbackAttempted: false,
        degraded: true,
        warningCodes: ["NEGATIVE_CUES_SKIPPED_PROVIDER_UNSUPPORTED"],
      })
    ).toBe("degraded");
  });

  it("warned when only warnings", () => {
    expect(
      deriveFinalStatus({
        payloadUsable: true,
        fallbackUsed: false,
        fallbackAttempted: false,
        degraded: false,
        warningCodes: ["PALETTE_NARROWED"],
      })
    ).toBe("warned");
  });

  it("ok when clean", () => {
    expect(
      deriveFinalStatus({
        payloadUsable: true,
        fallbackUsed: false,
        fallbackAttempted: false,
        degraded: false,
        warningCodes: [],
      })
    ).toBe("ok");
  });

  it("throws if fallbackUsed without attempted", () => {
    expect(() =>
      deriveFinalStatus({
        payloadUsable: true,
        fallbackUsed: true,
        fallbackAttempted: false,
        degraded: false,
        warningCodes: [],
      })
    ).toThrow(/fallbackAttempted/);
  });

  it("throws if fallbackUsed without payloadUsable", () => {
    expect(() =>
      deriveFinalStatus({
        payloadUsable: false,
        fallbackUsed: true,
        fallbackAttempted: true,
        degraded: false,
        warningCodes: [],
      })
    ).toThrow(/payloadUsable/);
  });
});

describe("assembleSubjectIdentityFromFrame", () => {
  const registry: CharacterEntry[] = [
    mockCharacter({
      canonicalName: "Tommy",
      aliases: ["Tom"],
      assetRef: "ref-1",
    }),
  ];

  it("resolves alias to canonical and assetRef", () => {
    const a = assembleSubjectIdentityFromFrame("Tom", registry);
    expect(a.canonicalName).toBe("Tommy");
    expect(a.subjectPrimary).toBe("Tommy");
    expect(a.assetRef).toBe("ref-1");
    expect(a.allowedIdentityTokens).toEqual(["Tommy"]);
  });
});

describe("normalizeSubjectIdentity", () => {
  it("is idempotent for NFC trim", () => {
    const registry: CharacterEntry[] = [
      mockCharacter({ canonicalName: "Tommy", aliases: ["Tom"] }),
    ];
    const assembled = assembleSubjectIdentityFromFrame("Tom", registry);
    const once = normalizeSubjectIdentity(assembled, registry);
    const twice = normalizeSubjectIdentity(
      { ...assembled, subjectPrimary: once.subjectPrimary },
      registry
    );
    expect(once.subjectPrimary).toBe(twice.subjectPrimary);
    expect(once.identityTokens).toEqual(twice.identityTokens);
  });

  it("replaces alias in a longer subjectPrimary string", () => {
    const registry: CharacterEntry[] = [
      mockCharacter({ canonicalName: "Tommy", aliases: ["Tom"] }),
    ];
    const assembled: import("./prompt-contract").AssembledSubjectIdentity = {
      canonicalName: "Tommy",
      subjectPrimary: "Tom at the door",
      allowedIdentityTokens: ["Tommy"],
      assetRef: null,
    };
    const n = normalizeSubjectIdentity(assembled, registry);
    expect(n.subjectPrimary).toBe("Tommy at the door");
    expect(n.removedTokens).toContain("Tom");
  });
});

describe("hasAppearanceRoleInjectionBeforeName", () => {
  it("detects young boy pile before canonical name (why: ref image must not get appearance injection)", () => {
    expect(hasAppearanceRoleInjectionBeforeName("the frightened young boy Tommy stands", "Tommy")).toBe(true);
  });

  it("allows comma clause order without young boy pattern (allowed reorder)", () => {
    expect(hasAppearanceRoleInjectionBeforeName("Tommy, frightened, at the doorway", "Tommy")).toBe(false);
  });
});

describe("evaluateCanonicalPromptUsability", () => {
  const registry: CharacterEntry[] = [
    mockCharacter({ canonicalName: "Tommy", aliases: [], assetRef: "r1" }),
  ];

  it("fails hard when identity token missing (why: continuity overrides architect wording)", () => {
    const assembled = assembleSubjectIdentityFromFrame("Tommy", registry);
    const normalized = normalizeSubjectIdentity(assembled, registry);
    const r = evaluateCanonicalPromptUsability(
      "A cinematic wide shot with dramatic lighting and palette blue, charcoal.",
      normalized,
      assembled
    );
    expect(r.canonicalUsable).toBe(false);
    expect(r.hardReasonCodes).toContain("IDENTITY_TOKEN_MISSING");
  });

  it("buildFrame maps identity failure to CONTRACT_CONFLICT", () => {
    const a = buildFramePromptContractAssessment({
      imagePrompt: "cinematic wide establishing shot with dramatic lighting and color palette only",
      subjectFocus: "Tommy",
      characterRegistry: registry,
      providerProfile: "test",
    });
    expect(a.payloadUsable).toBe(false);
    expect(a.resultMeta.failureClass).toBe("CONTRACT_CONFLICT");
  });

  it("soft issues only → usable but not strict (why: MEANINGFUL_TOKENS_LOW but identity preserved)", () => {
    const assembled = assembleSubjectIdentityFromFrame("Tommy", registry);
    const normalized = normalizeSubjectIdentity(assembled, registry);
    const longEnough = `Tommy ${"a ".repeat(20)}`;
    const r = evaluateCanonicalPromptUsability(longEnough, normalized, assembled);
    expect(r.canonicalUsable).toBe(true);
    expect(r.canonicalStrict).toBe(false);
    expect(r.softReasonCodes).toContain("MEANINGFUL_TOKENS_LOW");
  });
});

describe("serializeCanonicalForImageProvider", () => {
  it("truncates when over maxLength and emits warning code", () => {
    const long = "word ".repeat(5000);
    const { providerPrompt, warningCodes } = serializeCanonicalForImageProvider(long, { maxLength: 100 });
    expect(providerPrompt.length).toBe(100);
    expect(warningCodes).toContain("PROVIDER_PROMPT_TRUNCATED");
  });
});

describe("resolveFrameImagePromptWithFallback", () => {
  const styleGuide: VisualStyleGuide = {
    global: {
      medium: "film",
      materialLanguage: "",
      colorPalette: ["blue", "gray"],
      cameraPhysics: "",
      defaultLighting: "natural",
    },
    promptRegions: {
      subjectPrefix: "Subject:",
      cameraPrefix: "Cam:",
      lightingPrefix: "Light:",
      backgroundPrefix: "Bg:",
    },
    perScene: [{ sceneIndex: 0, lightingOverride: null, paletteOverride: null, environmentMood: "calm" }],
  };
  const frameSpec: FrameSpec = {
    clipDuration: 2,
    shotType: "close-up",
    narrativeIntent: "react",
    motionPolicy: "subtle",
    transitionIn: "cut",
    subjectFocus: "Tommy",
    pacingNote: "",
  };

  it("uses fallback when primary hard-fails (why: continuity wins over bad architect wording)", () => {
    const registry = [mockCharacter({ canonicalName: "Tommy", aliases: [], assetRef: "r1" })];
    const { imagePrompt, assessment } = resolveFrameImagePromptWithFallback({
      primaryImagePrompt: "cinematic lighting only, no subject name here at all",
      subjectFocus: "Tommy",
      characterRegistry: registry,
      providerProfile: "test",
      styleGuide,
      sceneIndex: 0,
      frameSpec,
    });
    expect(assessment.finalStatus).toBe("fallback");
    expect(imagePrompt).toContain("Tommy");
    expect(imagePrompt).toContain("close-up");
  });
});

describe("buildFramePromptContractAssessment", () => {
  it("exposes contract version in meta (traceability, not quality)", () => {
    const registry: CharacterEntry[] = [mockCharacter({ canonicalName: "Tommy" })];
    const prompt =
      "Subject: clay style Tommy sitting. Camera: wide. Lighting: soft. Background: hills. Palette: blue, white.";
    const a = buildFramePromptContractAssessment({
      imagePrompt: prompt,
      subjectFocus: "Tommy",
      characterRegistry: registry,
      providerProfile: "test",
    });
    expect(a.resultMeta.contractVersion).toBe(CONTRACT_VERSION);
    expect(a.payloadUsable).toBe(true);
  });

  it("folds provider length into warningCodes while payload stays usable", () => {
    const registry: CharacterEntry[] = [mockCharacter({ canonicalName: "Tommy" })];
    const longBody = "word ".repeat(5000);
    const prompt = `Tommy ${longBody}`;
    const a = buildFramePromptContractAssessment({
      imagePrompt: prompt,
      subjectFocus: "Tommy",
      characterRegistry: registry,
      providerProfile: "test",
    });
    expect(a.payloadUsable).toBe(true);
    expect(a.resultMeta.warningCodes).toContain("PROVIDER_PROMPT_TRUNCATED");
  });

  it("includes mergeReasonCodes in meta when passed", () => {
    const registry: CharacterEntry[] = [mockCharacter({ canonicalName: "Tommy" })];
    const a = buildFramePromptContractAssessment({
      imagePrompt: "Tommy scene wide shot camera lighting background palette blue.",
      subjectFocus: "Tommy",
      characterRegistry: registry,
      providerProfile: "test",
      mergeReasonCodes: ["MERGE_SUBJECT_PRIMARY_LOCKED"],
    });
    expect(a.resultMeta.mergeReasonCodes).toEqual(["MERGE_SUBJECT_PRIMARY_LOCKED"]);
  });
});
