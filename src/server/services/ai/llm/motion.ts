import { generateText as aiGenerateText, Output } from "ai";
import { recordAiCall } from "@/server/services/ai-audit";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type { MotionDirectorInput } from "@/types/pipeline";
import {
  buildMotionSkillContext,
  resolveEffectiveMotionPolicy,
  resolveCameraGrammar,
} from "@/server/prompts/skill-packs";
import { getMotionModelProfile, buildTargetModelBlock } from "./motion-model-profiles";

// ── Structured motion (LLM output) ──

export const frameMotionSpecSchema = z.object({
  primaryAction: z
    .string()
    .describe(
      "THE ONLY motion beat for the clip — what happens, in vivid physical language. Exactly one beat; if the story moment contains multiple actions, describe only the one that belongs to this frame and assume the others live in adjacent frames."
    ),
  cameraMove: z
    .string()
    .describe(
      "Single camera instruction: move type (pan, dolly, lock, drift), direction, and speed. Must respect CAMERA PHYSICS / motion policy when given."
    ),
  subjectDynamics: z
    .string()
    .describe(
      "Body mechanics, weight, timing, follow-through, plus natural secondary physics (hair, cloth, objects) caused by the primary action."
    ),
  endState: z
    .string()
    .describe(
      "How motion and camera settle by the last frame — stable pose, resting camera — for cut continuity or alignment toward the next frame when shown."
    ),
  negativeMotion: z
    .string()
    .describe(
      "Motions and failures to avoid: extra primary actions, morphing, face warping, illegal camera moves for the medium, text overlays, etc. Short phrases, comma-separated."
    ),
  /**
   * Whether the i2v model should be anchored to the next frame's image as
   * `end_image`. Only consulted when a next frame exists. "anchor" is the
   * legacy behavior (interpolate to the next frame); "freeform" omits the
   * end image and lets the model resolve naturally — use when interpolating
   * would produce a morph/transformer artifact.
   */
  endFramePolicy: z
    .enum(["anchor", "freeform"])
    .describe(
      "anchor = send next frame as end_image (continuous beat across the cut). freeform = omit end_image (next frame is a hard cut, different subject/location, or large angle change that would morph)."
    ),
  /**
   * Short free-text justification for the chosen `endFramePolicy`. Stored as
   * metadata only — never compiled into the video model prompt — so it can be
   * inspected from the review UI without affecting i2v output.
   */
  endFramePolicyReason: z
    .string()
    .optional()
    .describe(
      "Brief reason for the endFramePolicy choice (e.g. 'same subject, near-identical framing, hand-raise bridges cleanly' or 'different framing, would morph the face'). Metadata only — does not affect the video prompt."
    ),
});

export type FrameMotionSpec = z.infer<typeof frameMotionSpecSchema>;

// ── Per-model prompt compilers ──
//
// Each i2v model parses prompts differently; one universal template under-
// performs every model. Compilers below are tuned to each model's documented
// strengths and failure modes (see docs/video-model-prompts.md for sources).

/** Strip a leading "Camera"/"Camera:" if the LLM already wrote it. */
function stripCameraPrefix(s: string): string {
  return s.replace(/^camera\s*[:\-—]\s*/i, "").trim();
}

/** Ensure a clause ends with a single period. */
function asSentence(s: string): string {
  const t = s.trim().replace(/[.,;:\s]+$/, "");
  return t ? `${t}.` : "";
}

/**
 * Default compiler — legacy generic template. Used by Veo 3.1, Kling 3 Std/Pro,
 * Runway Gen-4 / Gen-4.5, and Grok. These models tolerate the format
 * acceptably; per-model tuning can be added later if data warrants.
 */
function compileDefault(spec: FrameMotionSpec): string {
  const pa = spec.primaryAction.trim();
  const sd = spec.subjectDynamics.trim();
  const cm = spec.cameraMove.trim();
  const es = spec.endState.trim();
  const neg = spec.negativeMotion.trim();

  const parts: string[] = [];
  if (pa) parts.push(pa);
  if (sd) parts.push(sd);
  if (cm) parts.push(`Camera: ${cm}`);
  if (es) parts.push(`Ending: ${es}`);
  if (neg) parts.push(`Avoid: ${neg}`);

  const body = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!body) return "";
  return `Smooth continuous motion throughout — ${body}`;
}

/**
 * Seedance 2.0 compiler.
 *
 * Seedance parses period-separated short declarative sentences as a beat
 * timeline. It also interprets negatives positively unless rephrased — so we
 * convert negativeMotion into a fixed positive anchor instead of echoing it.
 * The "Smooth continuous motion throughout —" prefix is dropped: it adds
 * nothing for Seedance and eats prompt budget.
 */
function compileSeedance(spec: FrameMotionSpec): string {
  const pa = asSentence(spec.primaryAction);
  const sd = asSentence(spec.subjectDynamics);
  const cm = stripCameraPrefix(spec.cameraMove);
  const es = spec.endState.trim();
  const neg = spec.negativeMotion.trim();

  const parts: string[] = [];
  if (pa) parts.push(pa);
  if (sd) parts.push(sd);
  if (cm) parts.push(asSentence(`Camera ${cm}`));
  if (es) parts.push(asSentence(`Settles: ${es}`));
  // Positive-form anchor instead of a negative list (Seedance interprets "no X"
  // as "X"). The LLM's negativeMotion is intentionally discarded here.
  if (neg) parts.push("Stable identity, natural proportions, clean edges throughout.");

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Kling v2.5 Turbo Pro compiler.
 *
 * Kuaishou's official prompt formula uses labelled clauses
 * (Subject + Movement + Scene + Camera + Lighting + Atmosphere). We don't
 * carry Lighting/Atmosphere fields, so we structure what we have using
 * Kling's preferred labelled form. Pacing words ('slowly', 'gradually') are
 * the documented mitigation for finger/face artifacts; we inject one if the
 * LLM didn't already emit one. Negatives are kept (Kling's negative_prompt
 * field handles short lists well) but lightly capped.
 */
function compileKling25Turbo(spec: FrameMotionSpec): string {
  const pacingRe = /\b(slow(ly)?|gradual(ly)?|gentl[ey]|slight(ly)?|softly)\b/i;
  let pa = spec.primaryAction.trim();
  if (pa && !pacingRe.test(pa)) {
    pa = `Slowly ${pa.charAt(0).toLowerCase()}${pa.slice(1)}`;
  }
  const sd = spec.subjectDynamics.trim();
  const cm = stripCameraPrefix(spec.cameraMove);
  const es = spec.endState.trim();
  const neg = spec.negativeMotion.trim();

  const parts: string[] = [];
  const subjectClause = [pa, sd].filter(Boolean).join(", ");
  if (subjectClause) parts.push(asSentence(subjectClause));
  if (cm) parts.push(asSentence(`Camera: ${cm}`));
  if (es) parts.push(asSentence(`Ending: ${es}`));
  if (neg) parts.push(asSentence(`Avoid: ${neg}`));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Pixverse V6 compiler.
 *
 * V6 is sequentially parsed (Subject + Action + Atmospheric motion + Camera
 * + Style/Mood). Three documented anti-patterns we eliminate:
 *   1. The "Smooth continuous motion throughout —" prefix — V6's default
 *      motion_mode already does this; the phrase wastes budget.
 *   2. "Ending:" — V6 has no end_image and no terminal-frame conditioning;
 *      explicit endings confuse the parser. Trajectory belongs in the verb.
 *   3. Inline "Avoid:" — burying negatives in the positive prompt is
 *      documented to HURT V6 quality. Until we wire negative_prompt through
 *      the Replicate provider, dropping is better than burying.
 */
function compilePixverseV6(spec: FrameMotionSpec): string {
  const pa = asSentence(spec.primaryAction);
  const sd = asSentence(spec.subjectDynamics);
  const cm = stripCameraPrefix(spec.cameraMove);

  const parts: string[] = [];
  if (pa) parts.push(pa);
  if (sd) parts.push(sd);
  if (cm) parts.push(asSentence(`Camera: ${cm}`));

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Turn structured motion into one dense prompt, tuned to the target model. */
export function compileMotionPrompt(
  spec: FrameMotionSpec,
  modelId?: TVideoModelId | null,
): string {
  switch (modelId) {
    case "seedance-2-pro":
    case "seedance-2-fast":
      return compileSeedance(spec);
    case "kling-v2.5-turbo-pro":
      return compileKling25Turbo(spec);
    case "pixverse-v6":
      return compilePixverseV6(spec);
    default:
      return compileDefault(spec);
  }
}

export type SingleFrameMotionResult = {
  motionSpec: FrameMotionSpec;
  visualDescription: string;
};

// ── Motion Director (narrow contract: MotionDirectorInput + images) ──

export async function generateSingleFrameMotion(
  input: MotionDirectorInput,
  currentImageUrl: string,
  nextImageUrl: string | null,
  model?: string,
  videoModelId?: TVideoModelId | null
): Promise<SingleFrameMotionResult> {
  const primaryModel = model || LLM.motionModel;

  const targetModelProfile = getMotionModelProfile(videoModelId);
  const targetModelBlock = buildTargetModelBlock(videoModelId);
  // Some i2v models cannot accept an end-image (Veo, Luma, Grok, Kling 3 Pro).
  // When the next frame can never be sent, we hard-clamp the policy to
  // "freeform" so the agent doesn't waste tokens reasoning about anchoring,
  // and so the output never claims an anchor that the renderer will silently
  // drop.
  const anchoringAvailable = nextImageUrl !== null
    && (targetModelProfile?.endFrameSupported ?? true);

  const basePolicy = input.motionPolicy;
  const effectivePolicy = resolveEffectiveMotionPolicy(basePolicy, {
    narrativeIntent: input.narrativeIntent,
    musicSectionId: input.skillHints?.musicSectionId,
  });
  const isHookSlot = input.isDefaultHookSlot === true;
  const skillProse = buildMotionSkillContext(input.skillHints, {
    assetRefCount: input.assetRefCount ?? 0,
    isHookEligible: isHookSlot,
    hookPatternId: input.skillHints?.hookPatternId,
  });

  const motionIntensity: Record<string, string> = {
    static: "Environmental motion ONLY (wind, particles, light shifts). NO subject movement. Camera locked or imperceptible drift. primaryAction should still name the environmental motion richly; subjectDynamics covers subtle environmental detail.",
    subtle: "ONE small gesture — breathing, weight shift, blink, gentle hand movement — but let it develop across time (ease-in, sustain, settle). subjectDynamics: natural secondary physics (hair sway, cloth settle). Camera may drift slowly so pixels move throughout.",
    moderate: "ONE clear primary action with full body mechanics — staged so motion is visibly underway early and resolves toward the end (not a pose held until the last second). subjectDynamics: secondary physics (hair, cloth, objects). Camera tracks, pans, or pushes enough that the frame reads as video, not a photo.",
    dynamic: "ONE strong primary action — muscle engagement, weight transfer, follow-through — with camera as active participant (dolly, pan, arc). subjectDynamics: reactive physics. Entire clip should feel kinetic.",
    frenetic: "ONE fast, intense primary action — snap, thrust, whip. subjectDynamics: explosive reactive physics. Dramatic camera move.",
  };

  const cameraConstraint = input.cameraPhysics
    ? `\nCAMERA PHYSICS: ${input.cameraPhysics} — cameraMove MUST respect these constraints.`
    : "";

  const materialConstraint = input.materialLanguage
    ? `\nMATERIAL LANGUAGE: Use this material's physics in primaryAction and subjectDynamics: "${input.materialLanguage}". Example: "sculpted clay arm extends" not "arm reaches forward".`
    : "";

  const skillBlock = skillProse
    ? `\n\nMOTION CRAFT (follow — compressed rules from editors; do not restate the whole image description):\n${skillProse}\n`
    : "";

  const grammarHint = resolveCameraGrammar({
    narrativeIntent: input.narrativeIntent,
    musicSectionId: input.skillHints?.musicSectionId,
  });
  const grammarBlock = grammarHint
    ? `\n\nCAMERA GRAMMAR (STRONGLY PREFER unless cameraPhysics conflicts):\n→ ${grammarHint}\n`
    : "";

  // Inverse-correlate motion intensity with VO density. Only inject when we
  // have a real signal (music videos have no VO words and pass 0).
  const wps = input.voTempoWps ?? 0;
  let tempoBlock = "";
  if (wps >= 3.0) {
    tempoBlock = `\n\nVO TEMPO: dense narration (~${wps.toFixed(1)} words/sec) — prefer simpler/slower camera moves and a single contained gesture; the audio is doing the work.\n`;
  } else if (wps > 0 && wps <= 1.5) {
    tempoBlock = `\n\nVO TEMPO: sparse narration (~${wps.toFixed(1)} words/sec) — push camera and subject motion harder so the frame stays alive.\n`;
  }


  const systemPrompt = `You are a motion director for an AI video generation model. The model receives ONE starting image and a single compiled text prompt. You output STRUCTURED fields that will be assembled into that prompt.

CORE PRINCIPLE: AI video models execute ONE action well. Multiple unrelated primary actions produce garbled, morphing artifacts.

TEMPORAL READ: The output must describe motion that READS AS VIDEO across the whole clip — visible movement early, middle, and late (camera drift counts). Avoid prompts that imply a nearly frozen tableau or only a twitch at the end; that yields slideshow-like clips.

MOTION POLICY: ${effectivePolicy.toUpperCase()}${basePolicy !== effectivePolicy ? ` (refined from base ${basePolicy} via section/intent rules)` : ""}
${motionIntensity[effectivePolicy] ?? motionIntensity.moderate}
${targetModelBlock}${cameraConstraint}${materialConstraint}${grammarBlock}${tempoBlock}${skillBlock}

SUBJECT MUST MOVE NATURALLY — NOT JUST THE CAMERA: primaryAction describes the SUBJECT'S OWN motion through world space, with believable physics. If the subject holds a pose and only the camera moves around it, the result feels like a 3D pan over a still photo. This is the most common cause of "static" output, even when a frame nominally has a "dynamic" policy.
- Translation through space: name where the subject travels — "drifts forward and crosses the field of view, background streaming past" not "is in flight, banked". For people: "pushes off and accelerates left-to-right across the lane" not "mid-stride".
- Articulation/rotation on the subject: name what rotates or deflects — "leans into the turn, helmet pivoting toward the apex" not "in a leaning pose".
- Internal/parts motion: name parts that move because of the action — wheels spin, propellers blur, exhaust trails behind, hair lifts, cloth ripples, mouth opens, eyes track, breath visible.
- Verbs: use verbs of MOTION ("crosses", "accelerates", "drifts", "rises", "falls", "swings", "pushes", "rolls", "rushes") not verbs of STATE ("is", "appears", "holds", "stands", "remains", "sits in").
- Background parallax: the world should move PAST the subject, not just camera-around-subject. If the prompt could be satisfied by a still image with only a moving camera, it is wrong — rewrite it.
- Natural physics (motion must be believable, not on-rails): name the physical signature appropriate to the subject's mass, momentum, and medium. Aircraft yaw and pitch slightly off-axis, not on a perfect rail; runners bob with each footfall, not glide; falling objects accelerate under gravity, not drift uniformly; vehicles rock on suspension, not float; water ripples and disperses, not slides. Avoid these unnatural failure modes: subject sliding without contact (skating feet, hovering wheels), subject moving on a perfect line (no drift, no body sway, no oscillation), subject internally frozen while translating (no propeller blur, no hair flutter, no cloth ripple), subject and camera locked in identical motion (parallax-zero feel).

ONE ACTION PER FRAME (STRICT): primaryAction must contain exactly one motion beat with one acting subject. If the story moment contains several actions, assume each beat lives in its own frame — describe ONLY the beat that belongs to THIS clip. (Examples of multi-beat moments that must split: "she opens the door / steps inside / sets down the bag", "he draws / aims / fires", "the wave rises / crests / crashes".)
- BANNED in primaryAction: connectors that join a SECOND beat or a NEW acting subject — "then", "and then", "followed by", "while", "as", "meanwhile", "while also", "; ", and ", " when it introduces a new subject. Example of a stitched-pair to split: "she turns toward the door, the lamp tips over" — that's two subjects acting; pick one.
- ALLOWED in primaryAction: clauses elaborating ONE beat with the SAME subject — "turns toward the door, weight shifting onto the back foot, hand rising to the handle" is one turn by one subject. "Turns toward the door while the lamp tips over" introduces a second subject and is forbidden.
- endState is a settle, not a new beat. Do NOT use it to smuggle in a fresh action (no "a second figure enters frame", no "an object falls in the background", no "a door bursts open" unless that event IS this clip's primaryAction). Natural deceleration only.
The storyboard splits dense action across consecutive frames so individual clips stay clean; do not undo that split here.

ONE BEAT ≠ SMALL BEAT: the cure for staticness is INTENSITY within the single beat, not adding beats. A punch-landing frame still feels explosive; a door-slam frame still feels sharp; a glance-up frame can still feel charged. Sources of energy, IN PRIORITY ORDER:
1. SUBJECT MOTION ITSELF (above) — the primary lever. A vivid verb of motion does most of the work; everything else amplifies.
2. subjectDynamics — secondary physics caused by primaryAction (hair, cloth, dust, breath, ripples, sparks, smoke, debris, recoil, sway, splatter). Layer richly. These are NOT separate beats.
3. Within-beat pacing on dynamic/frenetic frames — snap, thrust, or whip; build → peak → settle compresses to peak → settle → cut.
4. cameraMove — AMPLIFIES but does NOT substitute for subject motion. An aggressive camera on a still subject is a 3D photo, not video. Camera energy comes after subject energy. Use locked or gentle camera when the subject is doing the work; reach for fast push/arc/whip when the subject's own motion already justifies it.
"One" is a count, not a volume knob.

FIELD GUIDANCE (dense physical language in each — no filler):
- primaryAction: THE ONE beat for this clip. Lead with a verb of motion describing what the SUBJECT does in world space. Specific directions, speeds, body parts, displacement. "pushes off the blocks and accelerates two body-lengths down the lane, arms pumping" not "is running". For vehicles/objects: name translation, rotation, and internal motion (wheels, exhaust, trail). No compound actions, no static poses.
- cameraMove: One move only — type, direction, speed (e.g. "slow pan left", "locked tripod", "gentle handheld drift right"). Do not use cameraMove to compensate for a still subject.
- subjectDynamics: Mechanics, weight, timing, follow-through, plus reactive secondary physics (hair, cloth, dust, smoke, ripples, debris) caused by primaryAction.
- endState: Where bodies and camera rest at the end — supports hard cuts and transitions.${anchoringAvailable ? ` If you choose to anchor (see endFramePolicy), name the composition of the NEXT frame and describe how this clip arrives at it as one continuous beat. Otherwise, settle naturally without referencing the next frame.` : ` Natural deceleration — no new action at the end.`}
- negativeMotion: List what must NOT happen (extra actions, morphing, wrong camera grammar for the medium, dialogue text on screen).
${anchoringAvailable ? `- endFramePolicy: Anchoring the i2v model to the next frame forces it to interpolate between the two images. When the frames are visually close enough that interpolation produces real motion, this looks great and gives a continuous beat across the cut. When they are too far apart, it produces a face/body warp that looks like a morphing transformer — the failure you must avoid.
    Look at both images carefully. Silently judge: if I asked the model to start at the first and arrive at the second, would the in-between motion read as a believable physical action, or would it have to invent a morph to bridge them? Pick "anchor" only if the answer is the former. Pick "freeform" otherwise.
    Do not pick "anchor" as a default or to play it safe — an unjustified anchor is the main source of the morph artifact.
- endFramePolicyReason: One short clause justifying the choice based on what you see in the two images (e.g. "same subject, near-identical framing, hand-raise bridges cleanly" or "different framing, would morph the face"). Required when a next frame is shown.` : `- endFramePolicy: Set to "freeform"${nextImageUrl && targetModelProfile && !targetModelProfile.endFrameSupported ? ` (target model does not support end-frame anchoring — every clip must self-resolve)` : ` (no next frame to anchor to)`}.
- endFramePolicyReason: Leave empty.`}

QUALITY RULES:
- Directional and speed-specific language throughout; tie beats to clip duration (build, peak, settle — not instant snap unless frenetic)
- Do not describe static appearance — the model sees the image
- No abstract emotion ("feeling of wonder")
- Do not use the words "scene", "frame", "clip", "shot" in any field

TARGET: Compiled prompt ~55–130 words total across fields; include enough temporal detail that motion feels continuous, not a caption for one still.`;

  const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [];

  contentParts.push({ type: "text", text: "CURRENT FRAME — the video starts from this exact image:" });
  contentParts.push({ type: "image", image: new URL(currentImageUrl) });

  if (nextImageUrl) {
    const nextFrameCaption = anchoringAvailable
      ? "\nNEXT FRAME — when angles are similar, end toward this state:"
      : "\nNEXT FRAME — for context only (target model cannot be anchored to it). Use this to settle the cut naturally; do NOT try to morph into it:";
    contentParts.push({ type: "text", text: nextFrameCaption });
    contentParts.push({ type: "image", image: new URL(nextImageUrl) });
  }

  let context = `\nNarration context (story only — do NOT include dialogue or on-screen text): "${input.sceneText}"`;
  context += `\nClip duration: ${input.clipDuration}s`;
  context += `\nMotion policy: ${effectivePolicy} (base: ${input.motionPolicy})`;
  if (input.transitionIn) context += `\nTransition style: ${input.transitionIn}`;
  context += `\n\nFill all five structured fields.`;
  contentParts.push({ type: "text", text: context });

  const { output } = await recordAiCall(
    {
      provider: "openrouter",
      model: primaryModel,
      operation: "llm.generateSingleFrameMotion",
      request: {
        system: systemPrompt,
        contentParts,
        temperature: 0.7,
        schema: "frameMotionSpecSchema",
        clipDuration: input.clipDuration,
      },
    },
    () =>
      aiGenerateText({
        model: openrouter.chat(primaryModel),
        output: Output.object({ schema: frameMotionSpecSchema }),
        system: systemPrompt,
        messages: [{ role: "user", content: contentParts }],
        temperature: 0.7,
      }),
  );
  if (!output) throw new Error("Failed to generate frame motion");

  const visualDescription = compileMotionPrompt(output, videoModelId);
  if (!visualDescription) throw new Error("Compiled motion prompt is empty");

  return { motionSpec: output, visualDescription };
}
