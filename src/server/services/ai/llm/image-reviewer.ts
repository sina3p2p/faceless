import { generateText, Output, type ImagePart, type TextPart } from "ai";
import { z } from "zod";
import { openrouter } from "./index";
import { recordAiCall } from "@/server/services/ai-audit";
import { mediaUrl } from "@/lib/storage";
import type { AspectRatio } from "@/server/services/media";
import type { StoryAssetInput } from "@/types/worker";

export const REVIEW_FAILURE_CATEGORIES = [
  "missing_required_asset",
  "garbled_text",
  "severe_anatomy_artifact",
  "surreal_artifact_or_nonsense",
  "wrong_aspect_or_crop",
  "policy_refusal_or_blank",
  "chain_style_break",
] as const;

export type ReviewFailureCategory = (typeof REVIEW_FAILURE_CATEGORIES)[number];
export type ReviewSeverity = "hard" | "soft";

const reviewFailureSchema = z.object({
  category: z.enum(REVIEW_FAILURE_CATEGORIES),
  severity: z.enum(["hard", "soft"]),
  detail: z.string().describe("One concrete sentence naming what is observably wrong."),
});

const reviewResultSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  failures: z.array(reviewFailureSchema),
  correction_hint: z
    .string()
    .max(220)
    .nullable()
    .describe("ONE additive directive (<=200 chars) to append to the prompt on retry. Set to null on pass."),
});

export type ReviewFailure = z.infer<typeof reviewFailureSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;

export interface FrameMediaMetadata {
  reviewVerdict?: "pass" | "fail" | "skipped";
  reviewFailures?: ReviewFailure[];
  reviewAttempt?: number;
  correctionHint?: string;
  reviewModel?: string;
  sha256?: string;
}

export interface ReviewFrameImageInput {
  /** Storage key or absolute URL of the candidate image. */
  imageUrl: string;
  /** Storage key or absolute URL of the previously-accepted frame, for chain-style check. */
  prevImageUrl?: string | null;
  /** Canonical (non-augmented) prompt used to generate the candidate. */
  prompt: string;
  /** Asset names declared on the frame; used to check `missing_required_asset`. */
  assetRefs?: string[] | null;
  /** Story-asset reference sheets matched to those assetRefs (0..N). */
  matchedAssets: StoryAssetInput[];
  aspectRatio: AspectRatio;
  /** 1-based attempt number this review is for. */
  attempt: number;
  /** Correction hints accumulated from prior failed attempts. */
  priorHints: string[];
  /** OpenRouter model id (e.g. `openai/gpt-4.1`). */
  model: string;
}

const SYSTEM_PROMPT = `You are a strict QA inspector for AI-generated frame images in a short-form video pipeline.

Your ONE job: decide if the candidate frame is BROKEN — meaning it contains AI-generation faults or nonsense that any reasonable viewer would notice and call wrong. If you find a defect from the closed list below, return verdict="fail" with the matching category+severity. Otherwise return verdict="pass".

WHEN UNCERTAIN, RETURN PASS — except for prominent hands and faces, where the HAND-PROMINENCE RULE under severe_anatomy_artifact inverts this default. False alarms on minor things cause expensive regenerations with no guaranteed improvement, BUT a visibly broken hand in a hand-focused shot is the single most jarring AI artifact and must be caught.

WHAT "REALISTIC" MEANS HERE:
The video may use any visual style — photoreal, anime, claymation, watercolor, lego, 3D render, etc. "Realistic" does NOT mean "photorealistic". It means INTERNALLY CONSISTENT and free of AI hallucinations: characters and objects must obey the rules of the chosen style. An anime hand still has five fingers; a claymation room still has consistent geometry; a lego scene still has plausible bricks. Judge faults relative to the prompt's apparent style, not against photorealism.

YOU ARE NOT A STYLISTIC CRITIC. Do not return failures for composition, lighting mood, drama, color grading, artistic preference, or "could be more interesting / cinematic / dramatic". Only flag defects a reasonable viewer would call BROKEN.

FAILURE CATEGORIES (use ONLY these — do not invent new ones):

1. missing_required_asset (severity: hard)
   FAIL: assetRefs lists "Elena" but no human figure is present.
   PASS: Elena is in frame in a slightly different outfit than her sheet — that is drift, not missing.

2. garbled_text (severity: hard)
   Any rendered glyphs, letters, signs, logos, or labels that look like text but are scrambled, half-formed, or non-language. Counts even when the prompt did not ask for text — AI models hallucinate fake writing on signs, books, screens, clothing, walls.
   FAIL: a sign in the background reads "EOPN" or shows random shapes meant to be letters; a book cover has melted writing; a phone screen shows nonsense glyphs.
   PASS: prompt explicitly requests legible text and the text is correct; no text-like marks at all in the image; deliberately stylized lettering that is correct.

3. severe_anatomy_artifact (severity: hard)
   Bodies and faces that violate the rules of the chosen style. Hands are the most common AI failure mode — they require special discipline.

   HAND-PROMINENCE RULE — this overrides the global "when uncertain, pass" default:
   - A hand is "prominent" when ALL of these are true: it is the subject of the shot or one of the main visual elements, it is in clear focus (sharp enough to be evaluated), and it occupies a meaningful share of the frame. A hand that is large in frame but inherently un-countable — heavily motion-blurred to convey speed, rendered in deep shadow that is the artistic point of the shot, or extremely far away — is NOT "prominent" for this rule. Treat those under the PASS carve-outs below; do not fail them just because you can't count fingers.
   - For genuinely prominent hands (subject + in focus + meaningful share of frame), uncertainty defaults to **FAIL, not pass**. AI models routinely produce hands that look "almost right" but have a stubby thumb, missing knuckle, fused finger, or smooth lobe where a nail should be. If you cannot confidently identify five distinct, normally-jointed fingers per visible prominent hand, that is a FAIL.
   - When you flag a prominent hand, the 'detail' field MUST state the per-hand finger count you observed (e.g. "right hand: thumb is a smooth lobe without joint or nail; only 3 clear fingers visible") so the regeneration prompt can be specific.
   - Dramatic / dim / red-tinted lighting does NOT excuse ambiguity on a prominent hand — if the ambient lighting makes the hand unreadable, the image is broken, fail it. Motion blur is different: when the hand is in motion (gesturing, throwing a punch, gripping a steering wheel mid-turn) and the blur is consistent with the rest of the moving elements in the shot, that is intentional cinematic blur and the hand is NOT prominent for this rule.

   GENERAL FAIL EXAMPLES: a visible hand has 4 or 6+ fingers, fingers fused or extra-jointed, thumb in wrong place, thumb that looks like a smooth blob/lobe with no joint or nail, knuckle count wrong; a face has misaligned eyes / extra eye / merged features / melted skin; a character has two heads, three arms, a duplicated leg, or a limb attached at the wrong place; teeth that look fused or in multiple rows; an animal with the wrong number of legs or impossible joints.

   PASS only when:
   - The hand is small enough or background enough that a viewer wouldn't focus on it (not just "dark" — actually small or out of focus).
   - The hand is partially obscured by an object / in a pocket / behind the back / outside the frame and you cannot see enough to evaluate it (this is occlusion, not ambiguity).
   - The hand is heavily motion-blurred as a deliberate cinematic effect — fingers smear into a streak, the blur is directional and consistent with other moving elements in the shot. Example: a fist mid-punch, a hand sweeping across a control panel, fingers strumming a guitar at speed. Do NOT count fingers on intentionally-blurred hands.
   - Deliberate stylization (e.g. cartoon 4-finger hand) that is internally consistent across the image.

4. surreal_artifact_or_nonsense (severity: hard)
   AI hallucinations that are not anatomy: impossible geometry, objects merging into other objects without intent, duplicated body parts on inanimate objects, broken physics, floating items with no support when realism is implied, doors/windows/stairs that lead nowhere or are mid-wall, reflections that don't match the scene, shadows pointing the wrong way, an object morphing halfway into another object, repeated/cloned background elements that look glitched, hybrid creatures that the prompt did not ask for.
   FAIL: a chair has 5 legs that fuse into the floor; a building has a window phasing through a wall; a glass of water has the table visible THROUGH the glass at the wrong angle (not refraction — geometry break); a car has 3 wheels on one side; a staircase ends in mid-air against a flat wall.
   PASS: surrealism that the prompt explicitly asked for ("dreamlike", "Escher-style", "surreal"); stylistic exaggeration consistent with the chosen art style; minor background imperfection a viewer would not notice.

5. wrong_aspect_or_crop (severity: hard)
   FAIL: aspect was "9:16" but image arrived 1:1 with letterboxing; main subject's head/face is clipped off.
   PASS: subject is slightly off-center; safe area respected.

6. policy_refusal_or_blank (severity: hard)
   FAIL: image is solid color, blank, or shows a refusal/error/text-only message.
   PASS: dark moody scene with low contrast but real visual content.

7. chain_style_break (severity: hard)
   Only applicable when a PREVIOUS_FRAME image is provided.
   FAIL: previous frame showed Elena with red hair; this frame shows her with blonde hair (clear identity break, not just lighting).
   PASS: lighting / camera angle / mood differ between frames — that is normal cinematic variation.

INSPECTION CHECKLIST — work through this in your head before deciding. Be especially methodical on (a):
  a. For EVERY visible hand:
     1) Decide whether the hand is "prominent" — subject / in clear focus / meaningful share of frame, AND not inherently un-countable due to intentional motion blur, deep artistic shadow, or far distance. A blurred or shadowed hand that the artist clearly wanted blurred is NOT prominent for this rule.
     2) State the finger count you see (e.g. "left hand: thumb + 3 visible fingers; pinkie hidden behind grip"). If you cannot identify five distinct, normally-jointed fingers on a PROMINENT hand, that is a FAIL — even if the cause is bad ambient lighting. Skip the count for non-prominent hands.
     3) Check the thumb specifically (on prominent hands): it must have a visible joint and a normal tip / nail shape, not a smooth lobe or stubby blob.
  b. Check faces: eyes, mouth, ears symmetry; skin not melted; one head per body.
  c. Scan every text-like mark, sign, logo, label — is it real readable text or hallucinated?
  d. Trace structural lines: walls, floors, furniture legs, vehicle wheels — count and align them.
  e. Check shadows and reflections for direction consistency.
  f. Check for duplicated / cloned objects that look like a generation artifact.

ANY other observation, no matter how strong an aesthetic preference, is severity:"soft" — and we DO NOT need them. If you would tag something soft, OMIT it from failures entirely.

correction_hint: only set when verdict is "fail". Write ONE additive sentence (<=200 chars) — e.g. "Add Elena center frame, holding the sword from her sheet", or "Render hands clearly with five fingers each; no extra digits; no fake text in background." Do not contradict the prompt and do not include "remove" instructions that fight the canonical scene. When verdict is "pass", set correction_hint to null.

Return ONLY the JSON object that matches the schema. No prose.`;

function buildAssetSection(assets: StoryAssetInput[], declared: string[]): string {
  if (assets.length === 0 && declared.length === 0) return "  (none declared)";
  const lines: string[] = [];
  if (declared.length > 0) {
    lines.push(`  declared assetRefs (must be visibly present): ${declared.join(", ")}`);
  }
  for (const a of assets) {
    lines.push(`  - ${a.name} (${a.type}): ${a.description}`);
  }
  return lines.join("\n");
}

/**
 * Single-pass vision review of a candidate frame image. Returns a strict
 * pass/fail with categorical failures. The reviewer is intentionally
 * conservative — when in doubt it returns `pass`.
 */
export async function reviewFrameImage(input: ReviewFrameImageInput): Promise<ReviewResult> {
  const declared = input.assetRefs ?? [];
  const assetSection = buildAssetSection(input.matchedAssets, declared);

  const userText = `Inspect the CANDIDATE image against the prompt and return the verdict.

ASPECT_RATIO: ${input.aspectRatio}
ATTEMPT: ${input.attempt}

PROMPT (canonical):
${input.prompt}

REQUIRED STORY ASSETS:
${assetSection}

PRIOR CORRECTION HINTS (from earlier failed attempts; the candidate has had a chance to honor these):
${input.priorHints.length > 0 ? input.priorHints.map((h, i) => `  ${i + 1}. ${h}`).join("\n") : "  (none)"}

The first image labeled CANDIDATE is the one you are reviewing.${input.prevImageUrl ? "\nThe second image labeled PREVIOUS_FRAME is the previously-accepted frame; use it ONLY to check for chain_style_break — identity-level breaks, not lighting/mood differences." : ""}${input.matchedAssets.length > 0 ? "\nThe remaining images are story-asset reference sheets; use them ONLY to check identity for missing_required_asset and chain_style_break." : ""}`;

  const userContent: Array<ImagePart | TextPart> = [
    { type: "text", text: "CANDIDATE:" },
    { type: "image", image: mediaUrl(input.imageUrl) },
  ];

  if (input.prevImageUrl) {
    userContent.push({ type: "text", text: "PREVIOUS_FRAME:" });
    userContent.push({ type: "image", image: mediaUrl(input.prevImageUrl) });
  }

  for (const a of input.matchedAssets) {
    userContent.push({ type: "text", text: `REFERENCE SHEET — ${a.name} (${a.type}):` });
    userContent.push({ type: "image", image: mediaUrl(a.sheetUrl || a.url) });
  }

  userContent.push({ type: "text", text: userText });

  const { output } = await recordAiCall(
    {
      provider: "openrouter",
      model: input.model,
      operation: "llm.reviewFrameImage",
      request: {
        system: SYSTEM_PROMPT,
        userText,
        attempt: input.attempt,
        aspectRatio: input.aspectRatio,
        assetRefs: declared,
        priorHints: input.priorHints,
        candidateUrl: mediaUrl(input.imageUrl),
        prevFrameUrl: input.prevImageUrl ? mediaUrl(input.prevImageUrl) : null,
        matchedAssetSheetUrls: input.matchedAssets.map((a) => mediaUrl(a.sheetUrl || a.url)),
        temperature: 0,
        maxOutputTokens: 600,
        schema: "reviewResultSchema",
      },
      summarize: (r) => {
        const obj = (r as { output?: ReviewResult }).output;
        return obj
          ? { verdict: obj.verdict, failureCount: obj.failures.length, hasHint: !!obj.correction_hint }
          : { verdict: "unknown" };
      },
    },
    () =>
      generateText({
        model: openrouter.chat(input.model),
        output: Output.object({ schema: reviewResultSchema }),
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
        temperature: 0,
        maxOutputTokens: 600,
      }),
  );

  if (!output) {
    // Reviewer call returned no parsed object — treat as `pass` (fail-open) so
    // a flaky reviewer never blocks a good image. The audit row records the
    // raw response for diagnosis.
    return { verdict: "pass", failures: [], correction_hint: null };
  }

  return output;
}
