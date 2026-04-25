import { z } from "zod";
import type { FrameSpec, VisualStyleGuide } from "@/types/pipeline";

/**
 * Vercel AI SDK → Zod 4 `toJSONSchema(..., { io: "input" })`: fields with `.default()` are
 * omitted from `required`, which Azure / OpenAI strict structured outputs reject.
 *
 * - `imageSpecSchemaStrict` — use for OpenAI (and Azure) models; every key required (`""` / `[]` when unused).
 * - `imageSpecSchemaOptional` — use for other providers (Anthropic, Google, …) with `.default()` / optional ergonomics.
 *
 * Persisted shape is always normalized via `normalizeImageSpecInput` → `ImageSpec` (strict).
 */

export const imageSpecSchemaStrict = z.object({
  subject: z.object({
    primary: z.string().describe("Subject label from frame — will be replaced by continuity-safe primary when resolved"),
    secondary: z.array(z.string()).describe("Max 2 short labels; use [] if none"),
    focus: z.string().describe('Framing note; use "" if none'),
  }),
  action: z.string(),
  shot: z.object({
    type: z.string(),
    angle: z.string(),
    composition: z.string(),
    depthOfField: z.string(),
  }),
  environment: z.object({
    setting: z.string(),
    background: z.string(),
    effects: z.array(z.string()),
  }),
  lighting: z.object({
    key: z.string(),
    accent: z.string(),
    practicals: z.string(),
  }),
  style: z.object({
    medium: z.string(),
    material: z.string(),
    palette: z.array(z.string()),
  }),
  constraints: z.array(z.string()),
  negativeCues: z.array(z.string()),
});

/** Relaxed schema for models that accept optional / defaulted JSON Schema fields (e.g. Claude, Gemini). */
export const imageSpecSchemaOptional = z.object({
  subject: z.object({
    primary: z.string().describe("Subject label from frame — will be replaced by continuity-safe primary when resolved"),
    secondary: z.array(z.string()).default([]).describe("Max 2 short labels; empty if none"),
    focus: z.string().default("").describe("Framing note; empty if none"),
  }),
  action: z.string().default(""),
  shot: z
    .object({
      type: z.string().default(""),
      angle: z.string().default(""),
      composition: z.string().default(""),
      depthOfField: z.string().default(""),
    })
    .default({ type: "", angle: "", composition: "", depthOfField: "" }),
  environment: z
    .object({
      setting: z.string().default(""),
      background: z.string().default(""),
      effects: z.array(z.string()).default([]),
    })
    .default({ setting: "", background: "", effects: [] }),
  lighting: z
    .object({
      key: z.string().default(""),
      accent: z.string().default(""),
      practicals: z.string().default(""),
    })
    .default({ key: "", accent: "", practicals: "" }),
  style: z
    .object({
      medium: z.string().default(""),
      material: z.string().default(""),
      palette: z.array(z.string()).default([]),
    })
    .default({ medium: "", material: "", palette: [] }),
  constraints: z.array(z.string()).default([]),
  negativeCues: z.array(z.string()).default([]),
});

/** Canonical persisted / merged shape (strict). */
export type ImageSpec = z.infer<typeof imageSpecSchemaStrict>;

const EMPTY_IMAGE_SPEC: ImageSpec = {
  subject: { primary: "", secondary: [], focus: "" },
  action: "",
  shot: { type: "", angle: "", composition: "", depthOfField: "" },
  environment: { setting: "", background: "", effects: [] },
  lighting: { key: "", accent: "", practicals: "" },
  style: { medium: "", material: "", palette: [] },
  constraints: [],
  negativeCues: [],
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * True when structured output JSON Schema must list every `properties` key under `required`
 * (OpenAI + Azure chat completions). Other providers tolerate Zod `io: "input"` + defaults.
 */
export function usesStrictStructuredImageSpecModel(modelId: string): boolean {
  const m = modelId.trim().toLowerCase();
  if (!m) return false;
  return m.startsWith("openai/") || m.startsWith("azure/");
}

/** Coerce partial / legacy `imageSpec` JSON into canonical `ImageSpec`. */
export function normalizeImageSpecInput(input: unknown): ImageSpec {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return imageSpecSchemaStrict.parse(EMPTY_IMAGE_SPEC);
  }
  const o = input as Record<string, unknown>;
  const sub = asRecord(o.subject);
  const shot = asRecord(o.shot);
  const env = asRecord(o.environment);
  const lit = asRecord(o.lighting);
  const sty = asRecord(o.style);

  return imageSpecSchemaStrict.parse({
    subject: {
      primary: str(sub?.primary),
      secondary: strArr(sub?.secondary),
      focus: str(sub?.focus),
    },
    action: str(o.action),
    shot: {
      type: str(shot?.type),
      angle: str(shot?.angle),
      composition: str(shot?.composition),
      depthOfField: str(shot?.depthOfField),
    },
    environment: {
      setting: str(env?.setting),
      background: str(env?.background),
      effects: strArr(env?.effects),
    },
    lighting: {
      key: str(lit?.key),
      accent: str(lit?.accent),
      practicals: str(lit?.practicals),
    },
    style: {
      medium: str(sty?.medium),
      material: str(sty?.material),
      palette: strArr(sty?.palette),
    },
    constraints: strArr(o.constraints),
    negativeCues: strArr(o.negativeCues),
  });
}

/** @deprecated Use `imageSpecSchemaStrict` or `imageSpecSchemaOptional`. */
export const imageSpecSchema = imageSpecSchemaOptional;

/** Machine codes for upstream merge / sanitize (stored on ResultMeta.mergeReasonCodes). */
export const MERGE_REASON_CODES = [
  "MERGE_SUBJECT_PRIMARY_LOCKED",
  "MERGE_SUBJECT_SECONDARY_TRIMMED",
  "MERGE_SUBJECT_FOCUS_STRIPPED_REF_ASSET",
  "MERGE_SUBJECT_FOCUS_TRIMMED",
] as const;

export type MergeReasonCode = (typeof MERGE_REASON_CODES)[number];

export interface MergeImageSpecOptions {
  /** When set, focus must not pile appearance/role (ref-image constraint). */
  assetRef: string | null;
}

export interface MergeImageSpecResult {
  spec: ImageSpec;
  mergeReasonCodes: string[];
}

const FOCUS_APPEARANCE_ROLE = /\b(young|old|elderly|teenage|little)\s+(boy|girl|man|woman|child|kid)\b/i;

const MAX_SECONDARY = 2;

/**
 * Merge LLM spec with upstream identity: lock primary, cap/sanitize focus & secondary.
 * Accepts either strict or optional LLM output; always returns canonical `ImageSpec`.
 */
export function mergeImageSpecWithUpstream(
  spec: unknown,
  upstreamSubjectPrimary: string,
  options?: MergeImageSpecOptions
): MergeImageSpecResult {
  const base = normalizeImageSpecInput(spec);
  const mergeReasonCodes: string[] = [];
  const primary = upstreamSubjectPrimary.trim() || base.subject.primary.trim();
  if (primary !== base.subject.primary.trim()) {
    mergeReasonCodes.push("MERGE_SUBJECT_PRIMARY_LOCKED");
  }

  const rawFocus = base.subject.focus;
  let focus = rawFocus.trim();
  if (rawFocus !== "" && focus.length === 0) {
    mergeReasonCodes.push("MERGE_SUBJECT_FOCUS_TRIMMED");
  }
  if (focus && options?.assetRef && FOCUS_APPEARANCE_ROLE.test(focus)) {
    focus = "";
    mergeReasonCodes.push("MERGE_SUBJECT_FOCUS_STRIPPED_REF_ASSET");
  }

  let secondary = base.subject.secondary.map((s) => s.trim()).filter(Boolean);
  if (secondary.length > MAX_SECONDARY) {
    secondary = secondary.slice(0, MAX_SECONDARY);
    mergeReasonCodes.push("MERGE_SUBJECT_SECONDARY_TRIMMED");
  }

  const subject: ImageSpec["subject"] = {
    primary,
    secondary,
    focus,
  };

  return {
    spec: normalizeImageSpecInput({ ...base, subject }),
    mergeReasonCodes,
  };
}

/** @deprecated Use `mergeImageSpecWithUpstream` for merge audit codes. */
export function mergeImageSpecWithUpstreamSubject(spec: unknown, upstreamSubjectPrimary: string): ImageSpec {
  return mergeImageSpecWithUpstream(spec, upstreamSubjectPrimary, { assetRef: null }).spec;
}

/**
 * Deterministic canonical prompt. One MEDIUM line; optional Material line; no duplicate medium prose.
 */
export function serializeFrameImageSpec(params: {
  spec: ImageSpec;
  styleGuide: VisualStyleGuide;
  sceneIndex: number;
  frameSpec: FrameSpec;
}): string {
  const { spec, styleGuide, sceneIndex, frameSpec } = params;
  const pr = styleGuide.promptRegions;
  const ps = styleGuide.perScene.find((p) => p.sceneIndex === sceneIndex);

  const globalPalette = styleGuide.global.colorPalette.join(", ");
  const paletteText = spec.style.palette.length
    ? spec.style.palette.join(", ")
    : ps?.paletteOverride?.join(", ") ?? globalPalette;

  const lightingDetail =
    [spec.lighting.key, spec.lighting.accent, spec.lighting.practicals].filter(Boolean).join("; ") ||
    ps?.lightingOverride ||
    styleGuide.global.defaultLighting;

  const cameraParts = [frameSpec.shotType, spec.shot.angle, spec.shot.composition, spec.shot.depthOfField].filter(
    Boolean
  );
  const cameraLine = cameraParts.join(", ");

  const envParts = [spec.environment.background, spec.environment.setting, spec.environment.effects.join(", ")]
    .filter(Boolean)
    .join(", ");

  const secondary = spec.subject.secondary.length ? ` ${spec.subject.secondary.join(", ")}` : "";
  const focusFrag = spec.subject.focus ? ` (${spec.subject.focus})` : "";
  const actionFrag = spec.action ? ` ${spec.action}` : "";

  const lines: string[] = [];

  lines.push(`${pr.subjectPrefix} ${spec.subject.primary}${secondary}${focusFrag}.${actionFrag}`);
  lines.push(`Camera: ${pr.cameraPrefix} ${cameraLine}.`);
  lines.push(`Lighting: ${pr.lightingPrefix} ${lightingDetail}.`);
  lines.push(`Background: ${pr.backgroundPrefix} ${envParts || "scene-appropriate environment"}.`);
  lines.push(`Color palette: ${paletteText}.`);

  const globalMed = styleGuide.global.medium.trim();
  const specMed = spec.style.medium.trim();
  const mediumLine =
    specMed && specMed.toLowerCase() !== globalMed.toLowerCase() ? specMed : globalMed;
  lines.push(`MEDIUM: ${mediumLine}.`);

  if (spec.style.material.trim()) {
    lines.push(`Material: ${spec.style.material.trim()}.`);
  }

  if (spec.constraints.length) {
    lines.push(`Constraints: ${spec.constraints.join("; ")}.`);
  }
  if (spec.negativeCues.length) {
    lines.push(`Avoid: ${spec.negativeCues.join("; ")}.`);
  }

  return lines.join("\n");
}

export function buildUpstreamFallbackImagePrompt(params: {
  styleGuide: VisualStyleGuide;
  sceneIndex: number;
  frameSpec: FrameSpec;
  subjectPrimaryLine: string;
}): string {
  const { styleGuide, sceneIndex, frameSpec, subjectPrimaryLine } = params;
  const pr = styleGuide.promptRegions;
  const ps = styleGuide.perScene.find((p) => p.sceneIndex === sceneIndex);
  const palette = ps?.paletteOverride?.join(", ") ?? styleGuide.global.colorPalette.slice(0, 4).join(", ");
  const subject = subjectPrimaryLine.trim() || "subject";

  const lines = [
    `${pr.subjectPrefix} ${subject}.`,
    `Camera: ${pr.cameraPrefix} ${frameSpec.shotType} composition.`,
    `Lighting: ${pr.lightingPrefix} ${ps?.lightingOverride ?? styleGuide.global.defaultLighting}.`,
    `Background: ${pr.backgroundPrefix}.`,
    `Color palette: ${palette}.`,
    `MEDIUM: ${styleGuide.global.medium}.`,
  ];
  return lines.join("\n");
}
