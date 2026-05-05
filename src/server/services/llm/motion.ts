import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type { MotionDirectorInput } from "@/types/pipeline";
import {
  buildMotionSkillContext,
  resolveEffectiveMotionPolicy,
  resolveCameraGrammar,
} from "@/server/prompts/skill-packs";

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

/** Turn structured motion into one dense prompt for text-native video models. */
export function compileMotionPrompt(spec: FrameMotionSpec): string {
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

export type SingleFrameMotionResult = {
  motionSpec: FrameMotionSpec;
  visualDescription: string;
};

// ── Motion Director (narrow contract: MotionDirectorInput + images) ──

export async function generateSingleFrameMotion(
  input: MotionDirectorInput,
  currentImageUrl: string,
  nextImageUrl: string | null,
  model?: string
): Promise<SingleFrameMotionResult> {
  const primaryModel = model || LLM.motionModel;

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
${cameraConstraint}${materialConstraint}${grammarBlock}${tempoBlock}${skillBlock}

ONE ACTION PER FRAME (STRICT): primaryAction must contain exactly one motion beat with one acting subject. If the story moment contains several actions (e.g. a jet banks, a missile launches, an explosion blooms), assume each beat lives in its own frame — describe ONLY the beat that belongs to THIS clip.
- BANNED in primaryAction: connectors that join a SECOND beat or a NEW acting subject — "then", "and then", "followed by", "while", "as", "meanwhile", "while also", "; ", and ", " when it introduces a new subject (e.g. "...banks right, missile streaks away" stitches two beats — pick one).
- ALLOWED in primaryAction: clauses elaborating ONE beat with the SAME subject — "banks hard right, rolling fifteen degrees, dropping the nose toward the horizon" describes one bank from one subject. "Banks right while the missile launches" introduces a second subject and is forbidden.
- endState is a settle, not a new beat. Do NOT use it to smuggle in a fresh action (no "explosion blooms in the distance", no "debris tumbles", no "fireball balloons" unless the explosion IS this clip's primaryAction). Natural deceleration only.
The storyboard splits dense action across consecutive frames so individual clips stay clean; do not undo that split here.

ONE BEAT ≠ SMALL BEAT (READ THIS): the cure for staticness is INTENSITY within the single beat, not adding beats. A frame that holds only the missile launch should still feel explosive. Carry kinetic energy through:
- cameraMove: be aggressive when the beat warrants it — fast push-in, hard arc, whip-pan, snap zoom, rapid handheld. A locked tripod on a single dynamic beat is the #1 cause of "static" feel. Match camera speed to beat intensity.
- subjectDynamics: layer secondary physics RICHLY (vapor cones, heat shimmer, smoke billow, recoil flutter, cloth whip, debris drift, dust kick). These are NOT separate beats — they are reactive physics caused by the one primaryAction. Pile them on.
- Within-beat pacing: when motionPolicy is dynamic or frenetic, the single beat should snap, thrust, or whip — not unfold gently. Build → peak → settle compresses to peak → settle → cut.
Do not downgrade the kineticism of primaryAction just because it's the only beat. "One" is a count, not a volume knob.

FIELD GUIDANCE (dense physical language in each — no filler):
- primaryAction: THE ONE beat for this clip. Specific directions, speeds, body parts. "lifts left hand to forehead, fingers spread, elbow rising to shoulder height" not "raises hand". No compound actions.
- cameraMove: One move only — type, direction, speed (e.g. "slow pan left", "locked tripod", "gentle handheld drift right").
- subjectDynamics: Mechanics, weight, timing, follow-through, plus secondary motion that naturally results from primaryAction (hair, cloth, props).
- endState: Where bodies and camera rest at the end — supports hard cuts and transitions.${nextImageUrl ? ` If you choose to anchor (see endFramePolicy), name the composition of the NEXT frame and describe how this clip arrives at it as one continuous beat. Otherwise, settle naturally without referencing the next frame.` : ` Natural deceleration — no new action at the end.`}
- negativeMotion: List what must NOT happen (extra actions, morphing, wrong camera grammar for the medium, dialogue text on screen).
${nextImageUrl ? `- endFramePolicy: Anchoring the i2v model to the next frame forces it to interpolate between the two images. When the frames are visually close enough that interpolation produces real motion, this looks great and gives a continuous beat across the cut. When they are too far apart, it produces a face/body warp that looks like a morphing transformer — the failure you must avoid.
    Look at both images carefully. Silently judge: if I asked the model to start at the first and arrive at the second, would the in-between motion read as a believable physical action, or would it have to invent a morph to bridge them? Pick "anchor" only if the answer is the former. Pick "freeform" otherwise.
    Do not pick "anchor" as a default or to play it safe — an unjustified anchor is the main source of the morph artifact.
- endFramePolicyReason: One short clause justifying the choice based on what you see in the two images (e.g. "same subject, near-identical framing, hand-raise bridges cleanly" or "different framing, would morph the face"). Required when a next frame is shown.` : `- endFramePolicy: Set to "freeform" (no next frame to anchor to).
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
    contentParts.push({ type: "text", text: "\nNEXT FRAME — when angles are similar, end toward this state:" });
    contentParts.push({ type: "image", image: new URL(nextImageUrl) });
  }

  let context = `\nNarration context (story only — do NOT include dialogue or on-screen text): "${input.sceneText}"`;
  context += `\nClip duration: ${input.clipDuration}s`;
  context += `\nMotion policy: ${effectivePolicy} (base: ${input.motionPolicy})`;
  if (input.transitionIn) context += `\nTransition style: ${input.transitionIn}`;
  context += `\n\nFill all five structured fields.`;
  contentParts.push({ type: "text", text: context });

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: frameMotionSpecSchema }),
    system: systemPrompt,
    messages: [{ role: "user", content: contentParts }],
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to generate frame motion");

  const visualDescription = compileMotionPrompt(output);
  if (!visualDescription) throw new Error("Compiled motion prompt is empty");

  return { motionSpec: output, visualDescription };
}
