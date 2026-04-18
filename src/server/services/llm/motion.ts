import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type { MotionDirectorInput } from "@/types/pipeline";

// ── Structured motion (LLM output) ──

export const frameMotionSpecSchema = z.object({
  primaryAction: z
    .string()
    .describe(
      "ONE dominant motion beat for the clip — what happens, in vivid physical language. No second unrelated action."
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

  return parts.join(" ").replace(/\s+/g, " ").trim();
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

  const motionIntensity: Record<string, string> = {
    static: "Environmental motion ONLY (wind, particles, light shifts). NO subject movement. Camera locked or imperceptible drift. primaryAction should still name the environmental motion richly; subjectDynamics covers subtle environmental detail.",
    subtle: "ONE small gesture — breathing, weight shift, blink, gentle hand movement. subjectDynamics: natural secondary physics (hair sway, cloth settle). Camera may drift.",
    moderate: "ONE clear primary action with full body mechanics. subjectDynamics: secondary physics (hair, cloth, objects). Camera may track or pan slowly.",
    dynamic: "ONE strong primary action — muscle engagement, weight transfer, follow-through. subjectDynamics: reactive physics. Camera can dolly, pan, or arc.",
    frenetic: "ONE fast, intense primary action — snap, thrust, whip. subjectDynamics: explosive reactive physics. Dramatic camera move.",
  };

  const cameraConstraint = input.cameraPhysics
    ? `\nCAMERA PHYSICS: ${input.cameraPhysics} — cameraMove MUST respect these constraints.`
    : "";

  const materialConstraint = input.materialLanguage
    ? `\nMATERIAL LANGUAGE: Use this material's physics in primaryAction and subjectDynamics: "${input.materialLanguage}". Example: "sculpted clay arm extends" not "arm reaches forward".`
    : "";

  const systemPrompt = `You are a motion director for an AI video generation model. The model receives ONE starting image and a single compiled text prompt. You output STRUCTURED fields that will be assembled into that prompt.

CORE PRINCIPLE: AI video models execute ONE action well. Multiple unrelated primary actions produce garbled, morphing artifacts.

MOTION POLICY: ${input.motionPolicy.toUpperCase()}
${motionIntensity[input.motionPolicy]}
${cameraConstraint}${materialConstraint}

FIELD GUIDANCE (dense physical language in each — no filler):
- primaryAction: ONE dominant beat. Specific directions, speeds, body parts. "lifts left hand to forehead, fingers spread, elbow rising to shoulder height" not "raises hand".
- cameraMove: One move only — type, direction, speed (e.g. "slow pan left", "locked tripod", "gentle handheld drift right").
- subjectDynamics: Mechanics, weight, timing, follow-through, plus secondary motion that naturally results from primaryAction (hair, cloth, props).
- endState: Where bodies and camera rest at the end — supports hard cuts and transitions.${nextImageUrl ? ` If the next frame is similar, end moving toward that composition; if very different, settle naturally without a second action.` : ` Natural deceleration — no new action at the end.`}
- negativeMotion: List what must NOT happen (extra actions, morphing, wrong camera grammar for the medium, dialogue text on screen).

QUALITY RULES:
- Directional and speed-specific language throughout
- Do not describe static appearance — the model sees the image
- No abstract emotion ("feeling of wonder")
- Active voice
- Do not use the words "scene", "frame", "clip", "shot" in any field

TARGET: Compiled prompt ~40–100 words total across fields; every phrase should earn its place.`;

  const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [];

  contentParts.push({ type: "text", text: "CURRENT FRAME — the video starts from this exact image:" });
  contentParts.push({ type: "image", image: new URL(currentImageUrl) });

  if (nextImageUrl) {
    contentParts.push({ type: "text", text: "\nNEXT FRAME — when angles are similar, end toward this state:" });
    contentParts.push({ type: "image", image: new URL(nextImageUrl) });
  }

  let context = `\nNarration context (story only — do NOT include dialogue or on-screen text): "${input.sceneText}"`;
  context += `\nClip duration: ${input.clipDuration}s`;
  context += `\nMotion policy: ${input.motionPolicy}`;
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
