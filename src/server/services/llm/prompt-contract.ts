/**
 * Prompt Contract — image prompt pipeline (subject identity, usability, status).
 *
 * ## Contract change checklist
 * If you change any of:
 * - normalize behavior, multiset / identity token logic
 * - merge semantics, serialization output shape, precedence behavior
 * - `deriveFinalStatus` / fallback invariants
 * - provider usability limits
 * then also update:
 * - CONTRACT_VERSION (+ short breaking note below)
 * - docstrings on affected types / functions
 * - `prompt-contract.test.ts` expected outputs
 * - reason / warning codes if semantics changed
 *
 * ## Source of truth
 * - Structured assessment inputs (assembled identity) are truth from upstream.
 * - `normalizedSubjectIdentity` is deterministic normalization only (see `normalizeSubjectIdentity`).
 * - Canonical prompt string is produced by deterministic serialization from `ImageSpec` + upstream locks.
 */

import type { CharacterEntry, FrameSpec, VisualStyleGuide } from "@/lib/types";
import { buildUpstreamFallbackImagePrompt } from "./image-spec";

/** Bump when behavior above changes in a breaking way for fixtures / consumers. */
export const CONTRACT_VERSION = "1.1.0";

/**
 * 1.0.0 — Initial contract: subject assembly + normalization, canonical/provider usability,
 *          deriveFinalStatus, ResultMeta, appearance-injection check when assetRef.
 * 1.1.0 — Upstream-only fallback path, `resolveFrameImagePromptWithFallback`, provider-layer truncate helper.
 */

// ── Failure taxonomy (keep small; nuance lives in reason codes) ─────────────

export type FailureClass =
  | "DATA_INVALID"
  | "CONTRACT_CONFLICT"
  | "CANONICALIZATION_DEGRADED"
  | "PROVIDER_UNSUPPORTED"
  | "SERIALIZATION_FAILED";

export type FinalStatus = "ok" | "warned" | "degraded" | "fallback" | "failed";

// ── Reason / warning codes (machine-readable; UI maps to copy) ────────────────

export const DEGRADATION_REASON_CODES = [
  "CANONICAL_PROMPT_EMPTY",
  "CANONICAL_PROMPT_TOO_SHORT",
  "IDENTITY_TOKEN_MISSING",
  "APPEARANCE_INJECTION_WITH_REF",
  "MEANINGFUL_TOKENS_LOW",
  "STYLE_ONLY_LIKELY",
  "PROVIDER_PROMPT_TOO_LONG",
  "PROVIDER_PROMPT_EMPTY",
] as const;

export type DegradationReasonCode = (typeof DEGRADATION_REASON_CODES)[number];

export const WARNING_CODES = [
  "PALETTE_NARROWED",
  "NEGATIVE_CUES_SKIPPED_PROVIDER_UNSUPPORTED",
  "LOW_PRIORITY_DETAIL_DROPPED",
  "PROVIDER_PROMPT_TRUNCATED",
] as const;

export type WarningCode = (typeof WARNING_CODES)[number];

// ── Resolution / observability ────────────────────────────────────────────────

export interface AppliedAction {
  family: string;
  field?: string;
  action: string;
  winner: string;
  loser?: string;
  reasonCode?: string;
}

export interface ResultMeta {
  contractVersion: string;
  providerProfile: string;
  /** Derived; do not set independently — use `deriveFinalStatus`. */
  finalStatus: FinalStatus;
  degraded: boolean;
  degradationReasonCodes: string[];
  warningCodes: string[];
  appliedActions: AppliedAction[];
  truncated?: boolean;
  failureClass?: FailureClass;
  canonicalUsable: boolean;
  providerPayloadUsable: boolean;
  /** True iff both canonical and provider checks pass. */
  payloadUsable: boolean;
  fallbackAttempted: boolean;
  fallbackUsed: boolean;
}

// ── Subject path: assembled → normalized → serialized fragment ───────────────

/**
 * Upstream-assembled identity (continuity + frame subject focus).
 * `subjectPrimary` must not be invented by the Prompt Architect — only resolved from registry / focus.
 */
export interface AssembledSubjectIdentity {
  canonicalName?: string;
  subjectPrimary: string;
  allowedIdentityTokens: string[];
  assetRef: string | null;
}

/**
 * Output of deterministic normalization only (trim, NFC, alias → canonical, safe casing).
 */
export interface NormalizedSubjectIdentity {
  subjectPrimary: string;
  identityTokens: string[];
  removedTokens: string[];
}

const MIN_CANONICAL_PROMPT_LENGTH = 24;
const MIN_MEANINGFUL_TOKENS = 3;
const DEFAULT_PROVIDER_MAX_PROMPT_LENGTH = 12_000;
const MAX_APPLIED_ACTIONS_META = 20;

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "at",
  "for",
  "with",
  "from",
  "by",
  "as",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
]);

/** Words that must not appear immediately before canonical name when assetRef is set (appearance/role pile-up). */
const APPEARANCE_ROLE_BEFORE_NAME = /\b(young|old|elderly|teenage|little)\s+(boy|girl|man|woman|child|kid)\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUnicode(s: string): string {
  return s.normalize("NFC").trim();
}

function tokenizeIdentity(s: string): string[] {
  return normalizeUnicode(s)
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((t) => t.length > 0);
}

/**
 * Build assembled subject identity from storyboard `subjectFocus` + continuity registry.
 */
export function assembleSubjectIdentityFromFrame(
  subjectFocus: string,
  characterRegistry: CharacterEntry[]
): AssembledSubjectIdentity {
  const focus = normalizeUnicode(subjectFocus);
  if (!focus) {
    return { subjectPrimary: "", allowedIdentityTokens: [], assetRef: null };
  }

  const lower = focus.toLowerCase();
  for (const c of characterRegistry) {
    if (c.canonicalName.toLowerCase() === lower) {
      return {
        canonicalName: c.canonicalName,
        subjectPrimary: c.canonicalName,
        allowedIdentityTokens: tokenizeIdentity(c.canonicalName),
        assetRef: c.assetRef,
      };
    }
    for (const a of c.aliases) {
      if (a.toLowerCase() === lower) {
        return {
          canonicalName: c.canonicalName,
          subjectPrimary: c.canonicalName,
          allowedIdentityTokens: tokenizeIdentity(c.canonicalName),
          assetRef: c.assetRef,
        };
      }
    }
  }

  const tokens = tokenizeIdentity(focus);
  return {
    subjectPrimary: focus,
    allowedIdentityTokens: tokens,
    assetRef: null,
  };
}

/**
 * Deterministic normalization only: NFC, trim, alias → canonical on `subjectPrimary`.
 * Does not paraphrase or add lemmas.
 */
export function normalizeSubjectIdentity(
  assembled: AssembledSubjectIdentity,
  characterRegistry: CharacterEntry[]
): NormalizedSubjectIdentity {
  let subjectPrimary = normalizeUnicode(assembled.subjectPrimary);
  const removedTokens: string[] = [];

  for (const c of characterRegistry) {
    for (const alias of c.aliases) {
      const al = alias.trim();
      if (al.length === 0) continue;
      const re = new RegExp(`\\b${escapeRegExp(al)}\\b`, "giu");
      if (re.test(subjectPrimary)) {
        removedTokens.push(al);
        subjectPrimary = subjectPrimary.replace(re, c.canonicalName);
      }
    }
  }

  subjectPrimary = normalizeUnicode(subjectPrimary);

  const identityTokens =
    assembled.canonicalName != null
      ? tokenizeIdentity(assembled.canonicalName)
      : tokenizeIdentity(subjectPrimary);

  return {
    subjectPrimary,
    identityTokens,
    removedTokens,
  };
}

/** Final subject fragment inserted into a canonical prompt (v1: normalized primary line). */
export function serializeSubjectBlock(n: NormalizedSubjectIdentity): string {
  return n.subjectPrimary;
}

function containsWord(haystack: string, word: string): boolean {
  if (!word) return true;
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, "iu");
  return re.test(haystack);
}

function countMeaningfulTokens(text: string): number {
  const parts = normalizeUnicode(text).split(/\s+/);
  let n = 0;
  for (const p of parts) {
    const w = p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
    if (w.length > 2 && !STOPWORDS.has(w)) n++;
  }
  return n;
}

function styleOnlyLikely(text: string): boolean {
  const t = normalizeUnicode(text).toLowerCase();
  if (t.length < 40) return false;
  const camera = /\bcamera\b|\bshot\b|\blighting\b|\bbackground\b|\bpalette\b/i.test(t);
  const subjectCue = /\b(subject|character|figure|person|portrait)\b/i.test(t);
  return camera && !subjectCue;
}

/**
 * True if forbidden appearance/role pile appears in the window immediately before the canonical name.
 */
export function hasAppearanceRoleInjectionBeforeName(
  prompt: string,
  canonicalName: string
): boolean {
  const p = prompt.normalize("NFC");
  const idx = p.search(new RegExp(`\\b${escapeRegExp(canonicalName)}\\b`, "iu"));
  if (idx <= 0) return false;
  const windowStart = Math.max(0, idx - 120);
  const before = p.slice(windowStart, idx);
  return APPEARANCE_ROLE_BEFORE_NAME.test(before);
}

export interface CanonicalUsabilityResult {
  /** No hard canonical failures — prompt may be sent downstream. */
  canonicalUsable: boolean;
  /** No hard and no soft canonical issues (strict QA pass). */
  canonicalStrict: boolean;
  hardReasonCodes: string[];
  softReasonCodes: string[];
  degradationReasonCodes: string[];
  warningCodes: string[];
  appliedActions: AppliedAction[];
}

/**
 * Mechanical checks on the LLM-produced image prompt (canonical layer, pre-provider).
 */
export function evaluateCanonicalPromptUsability(
  canonicalPrompt: string,
  normalizedSubject: NormalizedSubjectIdentity,
  assembled: AssembledSubjectIdentity
): CanonicalUsabilityResult {
  const warningCodes: string[] = [];
  const appliedActions: AppliedAction[] = [];

  const p = normalizeUnicode(canonicalPrompt);

  const hardReasonCodes: string[] = [];
  const softReasonCodes: string[] = [];

  if (p.length === 0) {
    hardReasonCodes.push("CANONICAL_PROMPT_EMPTY");
    const degradationReasonCodes = [...hardReasonCodes];
    return {
      canonicalUsable: false,
      canonicalStrict: false,
      hardReasonCodes,
      softReasonCodes,
      degradationReasonCodes,
      warningCodes,
      appliedActions,
    };
  }

  if (p.length < MIN_CANONICAL_PROMPT_LENGTH) {
    softReasonCodes.push("CANONICAL_PROMPT_TOO_SHORT");
  }

  for (const token of normalizedSubject.identityTokens) {
    if (!containsWord(p, token)) {
      hardReasonCodes.push("IDENTITY_TOKEN_MISSING");
      appliedActions.push({
        family: "identity",
        field: "subject",
        action: "DROP_LOWER",
        winner: "continuity",
        loser: "architect_wording",
        reasonCode: "IDENTITY_TOKEN_MISSING",
      });
      break;
    }
  }

  if (assembled.assetRef && assembled.canonicalName) {
    if (hasAppearanceRoleInjectionBeforeName(p, assembled.canonicalName)) {
      hardReasonCodes.push("APPEARANCE_INJECTION_WITH_REF");
      appliedActions.push({
        family: "identity",
        field: "subject",
        action: "NORMALIZE",
        winner: "continuity_ref_constraint",
        loser: "architect_appearance",
        reasonCode: "APPEARANCE_INJECTION_WITH_REF",
      });
    }
  }

  const meaningful = countMeaningfulTokens(p);
  if (meaningful < MIN_MEANINGFUL_TOKENS) {
    softReasonCodes.push("MEANINGFUL_TOKENS_LOW");
  }

  if (styleOnlyLikely(p)) {
    softReasonCodes.push("STYLE_ONLY_LIKELY");
  }

  const canonicalUsable = hardReasonCodes.length === 0;
  const canonicalStrict = canonicalUsable && softReasonCodes.length === 0;
  const degradationReasonCodes = [...new Set([...hardReasonCodes, ...softReasonCodes])];

  return {
    canonicalUsable,
    canonicalStrict,
    hardReasonCodes: [...new Set(hardReasonCodes)],
    softReasonCodes: [...new Set(softReasonCodes)],
    degradationReasonCodes,
    warningCodes,
    appliedActions: capAppliedActions(appliedActions),
  };
}

export interface ProviderUsabilityResult {
  providerPayloadUsable: boolean;
  hardReasonCodes: string[];
  degradationReasonCodes: string[];
  appliedActions: AppliedAction[];
}

export function evaluateProviderPayloadUsability(
  prompt: string,
  options?: { maxLength?: number }
): ProviderUsabilityResult {
  const maxLength = options?.maxLength ?? DEFAULT_PROVIDER_MAX_PROMPT_LENGTH;
  const p = normalizeUnicode(prompt);
  const hardReasonCodes: string[] = [];
  const appliedActions: AppliedAction[] = [];

  if (p.length === 0) {
    hardReasonCodes.push("PROVIDER_PROMPT_EMPTY");
    return {
      providerPayloadUsable: false,
      hardReasonCodes,
      degradationReasonCodes: [...hardReasonCodes],
      appliedActions,
    };
  }
  if (p.length > maxLength) {
    hardReasonCodes.push("PROVIDER_PROMPT_TOO_LONG");
    appliedActions.push({
      family: "provider",
      field: "payload",
      action: "DROP_LOWER",
      winner: "length_limit",
      loser: "raw_prompt",
      reasonCode: "PROVIDER_PROMPT_TOO_LONG",
    });
  }

  return {
    providerPayloadUsable: hardReasonCodes.length === 0,
    hardReasonCodes: [...new Set(hardReasonCodes)],
    degradationReasonCodes: [...new Set(hardReasonCodes)],
    appliedActions: capAppliedActions(appliedActions),
  };
}

function capAppliedActions(actions: AppliedAction[]): AppliedAction[] {
  if (actions.length <= MAX_APPLIED_ACTIONS_META) return actions;
  return actions.slice(0, MAX_APPLIED_ACTIONS_META);
}

/**
 * Invariants (documentary guardrails — keep in sync when refactoring):
 * - `fallbackUsed === true` ⇒ `fallbackAttempted === true` && `payloadUsable === true`
 * - `!payloadUsable` ⇒ `finalStatus === "failed"`
 * - `fallbackUsed && payloadUsable` ⇒ `finalStatus === "fallback"`
 */
export function deriveFinalStatus(input: {
  payloadUsable: boolean;
  fallbackUsed: boolean;
  fallbackAttempted: boolean;
  degraded: boolean;
  warningCodes: string[];
}): FinalStatus {
  if (input.fallbackUsed && !input.fallbackAttempted) {
    throw new Error("Contract invariant violated: fallbackUsed requires fallbackAttempted");
  }
  if (input.fallbackUsed && !input.payloadUsable) {
    throw new Error("Contract invariant violated: fallbackUsed requires payloadUsable");
  }

  if (!input.payloadUsable) return "failed";
  if (input.fallbackUsed) return "fallback";
  if (input.degraded) return "degraded";
  if (input.warningCodes.length > 0) return "warned";
  return "ok";
}

export interface BuildFramePromptContractInput {
  imagePrompt: string;
  subjectFocus: string;
  characterRegistry: CharacterEntry[];
  /** e.g. model id or "kling" / "dall-e" for tracing */
  providerProfile: string;
  /** When true, upstream-only fallback was attempted after primary prompt failed contract. */
  fallbackAttempted?: boolean;
  /** When true, fallback path produced the winning payload (requires usable payload). */
  fallbackUsed?: boolean;
}

export interface FramePromptContractAssessment {
  assembled: AssembledSubjectIdentity;
  normalized: NormalizedSubjectIdentity;
  canonicalUsable: boolean;
  providerPayloadUsable: boolean;
  payloadUsable: boolean;
  finalStatus: FinalStatus;
  resultMeta: ResultMeta;
}

/**
 * Full assessment for one frame's `imagePrompt` vs upstream subject + continuity.
 */
export function buildFramePromptContractAssessment(
  input: BuildFramePromptContractInput
): FramePromptContractAssessment {
  const fallbackAttempted = input.fallbackAttempted ?? false;
  const fallbackUsed = input.fallbackUsed ?? false;

  const assembled = assembleSubjectIdentityFromFrame(input.subjectFocus, input.characterRegistry);
  const normalized = normalizeSubjectIdentity(assembled, input.characterRegistry);

  const canonical = evaluateCanonicalPromptUsability(input.imagePrompt, normalized, assembled);
  const provider = evaluateProviderPayloadUsability(input.imagePrompt);

  const canonicalUsable = canonical.canonicalUsable;
  const providerPayloadUsable = provider.providerPayloadUsable;
  const payloadUsable = canonicalUsable && providerPayloadUsable;

  const degradationReasonCodes = [
    ...new Set([...canonical.degradationReasonCodes, ...provider.degradationReasonCodes]),
  ];

  /** Shipped prompt has soft quality issues (short, low tokens, style-heavy) but no hard failures. */
  const isDegraded = payloadUsable && !canonical.canonicalStrict;

  const warningCodes = [...new Set(canonical.warningCodes)];

  const mergedActions = [...canonical.appliedActions, ...provider.appliedActions];
  const actionsTruncated = mergedActions.length > MAX_APPLIED_ACTIONS_META;
  const appliedActions = capAppliedActions(mergedActions);

  const finalStatus = deriveFinalStatus({
    payloadUsable,
    fallbackUsed,
    fallbackAttempted,
    degraded: isDegraded,
    warningCodes,
  });

  let failureClass: FailureClass | undefined;
  if (!payloadUsable) {
    failureClass =
      !canonicalUsable && !providerPayloadUsable
        ? "SERIALIZATION_FAILED"
        : !canonicalUsable
          ? "DATA_INVALID"
          : "PROVIDER_UNSUPPORTED";
  } else if (isDegraded) {
    failureClass = "CANONICALIZATION_DEGRADED";
  }

  const resultMeta: ResultMeta = {
    contractVersion: CONTRACT_VERSION,
    providerProfile: input.providerProfile,
    finalStatus,
    degraded: isDegraded,
    degradationReasonCodes,
    warningCodes,
    appliedActions,
    truncated: actionsTruncated,
    failureClass,
    canonicalUsable,
    providerPayloadUsable,
    payloadUsable,
    fallbackAttempted,
    fallbackUsed,
  };

  return {
    assembled,
    normalized,
    canonicalUsable,
    providerPayloadUsable,
    payloadUsable,
    finalStatus,
    resultMeta,
  };
}

export interface ResolveFrameImagePromptInput {
  primaryImagePrompt: string;
  subjectFocus: string;
  characterRegistry: CharacterEntry[];
  providerProfile: string;
  styleGuide: VisualStyleGuide;
  sceneIndex: number;
  frameSpec: FrameSpec;
}

/**
 * Assess serialized canonical prompt; if hard-failed, try boring upstream-only fallback.
 * Returns the prompt to persist and the assessment for the winning string.
 */
export function resolveFrameImagePromptWithFallback(
  input: ResolveFrameImagePromptInput
): { imagePrompt: string; assessment: FramePromptContractAssessment } {
  const assembled = assembleSubjectIdentityFromFrame(input.subjectFocus, input.characterRegistry);
  const normalized = normalizeSubjectIdentity(assembled, input.characterRegistry);
  const subjectLine = normalized.subjectPrimary;

  const primaryAssessment = buildFramePromptContractAssessment({
    imagePrompt: input.primaryImagePrompt,
    subjectFocus: input.subjectFocus,
    characterRegistry: input.characterRegistry,
    providerProfile: input.providerProfile,
    fallbackAttempted: false,
    fallbackUsed: false,
  });

  if (primaryAssessment.payloadUsable) {
    return { imagePrompt: input.primaryImagePrompt, assessment: primaryAssessment };
  }

  const fallbackPrompt = buildUpstreamFallbackImagePrompt({
    styleGuide: input.styleGuide,
    sceneIndex: input.sceneIndex,
    frameSpec: input.frameSpec,
    subjectPrimaryLine: subjectLine,
  });

  const fallbackProbe = buildFramePromptContractAssessment({
    imagePrompt: fallbackPrompt,
    subjectFocus: input.subjectFocus,
    characterRegistry: input.characterRegistry,
    providerProfile: input.providerProfile,
    fallbackAttempted: true,
    fallbackUsed: false,
  });

  if (fallbackProbe.payloadUsable) {
    const won = buildFramePromptContractAssessment({
      imagePrompt: fallbackPrompt,
      subjectFocus: input.subjectFocus,
      characterRegistry: input.characterRegistry,
      providerProfile: input.providerProfile,
      fallbackAttempted: true,
      fallbackUsed: true,
    });
    return { imagePrompt: fallbackPrompt, assessment: won };
  }

  const retriedPrimary = buildFramePromptContractAssessment({
    imagePrompt: input.primaryImagePrompt,
    subjectFocus: input.subjectFocus,
    characterRegistry: input.characterRegistry,
    providerProfile: input.providerProfile,
    fallbackAttempted: true,
    fallbackUsed: false,
  });
  return { imagePrompt: input.primaryImagePrompt, assessment: retriedPrimary };
}

/** Wire payload: canonical string trimmed to provider limit (second layer). */
export function serializeCanonicalForImageProvider(
  canonicalPrompt: string,
  options?: { maxLength?: number }
): { providerPrompt: string; warningCodes: string[] } {
  const maxLength = options?.maxLength ?? DEFAULT_PROVIDER_MAX_PROMPT_LENGTH;
  const warningCodes: string[] = [];
  let p = normalizeUnicode(canonicalPrompt);
  if (p.length > maxLength) {
    p = p.slice(0, maxLength);
    warningCodes.push("PROVIDER_PROMPT_TRUNCATED");
  }
  return { providerPrompt: p, warningCodes };
}

/**
 * Optional structured log for debugging (shape stable for ingestion).
 */
export function formatPromptContractLogLine(meta: ResultMeta, context: Record<string, unknown>): string {
  return JSON.stringify({ kind: "prompt_contract", context, meta });
}
