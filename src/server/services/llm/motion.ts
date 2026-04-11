import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type { MotionDirectorInput } from "@/lib/types";

// ── Motion Agent Schema ──

const singleFrameMotionSchema = z.object({
  visualDescription: z.string().describe("Detailed motion instructions for an AI video model. Describe exactly what every visible subject physically does — body movement, facial expressions, hand gestures, object interactions — plus environment motion and camera direction."),
});

export type SingleFrameMotionOutput = z.infer<typeof singleFrameMotionSchema>;

// ── Motion Director (narrow contract: MotionDirectorInput + images) ──

export async function generateSingleFrameMotion(
  input: MotionDirectorInput,
  currentImageUrl: string,
  nextImageUrl: string | null,
  model?: string
): Promise<SingleFrameMotionOutput> {
  const primaryModel = model || LLM.motionModel;

  const motionIntensity: Record<string, string> = {
    static: "Subtle environmental motion ONLY (wind, particles, light shifts). NO subject movement. The subject holds their pose completely still. Camera is locked or moves imperceptibly.",
    subtle: "Small gestures only — breathing, weight shifts, blinking, gentle hand movements. Camera may drift slightly. No travel, no large actions.",
    moderate: "ONE clear primary action with natural body mechanics. Camera may track or pan slowly. Secondary micro-movements allowed (hair, cloth).",
    dynamic: "Multiple sequential actions permitted. Camera can dolly, pan, or arc. Full body movement, interactions with objects. Clear kinetic energy.",
    frenetic: "Rapid, intense motion. Multiple simultaneous actions. Dramatic camera work — whip pans, push-ins. High urgency and physical intensity.",
  };

  const cameraConstraint = input.cameraPhysics
    ? `\nCAMERA PHYSICS: ${input.cameraPhysics} — your camera moves MUST respect these physical constraints.`
    : "";

  const materialConstraint = input.materialLanguage
    ? `\nMATERIAL LANGUAGE: Describe motion using this material's physics: "${input.materialLanguage}". Example: "sculpted clay arm extends" not "arm reaches forward".`
    : "";

  const systemPrompt = `You are a motion director for an AI video generation model. The model receives ONE starting image and your text instructions. It only renders visible physical motion.

MOTION POLICY: ${input.motionPolicy.toUpperCase()}
${motionIntensity[input.motionPolicy]}
${cameraConstraint}${materialConstraint}

TIMING (${input.clipDuration}s clip):
- First ~40%: initiation — action begins, builds momentum
- Middle ~40%: peak — action reaches fullest expression
- Final ~20%: resolution — motion settles or completes

PRIORITIES — describe in this order:
1. SUBJECT ACTIONS — ONE dominant action per subject with body mechanics. Up to 2 subtle secondary movements.
2. OBJECT INTERACTIONS — how objects move, react to forces
3. ENVIRONMENT MOTION — max 1-2 effects (wind, particles, light)
4. CAMERA — direction, speed, type. Precise: "slow steady dolly forward" not "push in"

RULES:
- SPECIFIC BODY MECHANICS: "lifts left hand to forehead, fingers spread" not "raises hand"
- DIRECTIONAL MOVEMENT: "slides left-to-right" not "moves across"
- SPEED CUES: "snaps head right suddenly" vs "slowly rotates head to the right"
- SEQUENTIAL: "reaches for handle, pulls door open, steps through"

BANNED:
- Emotional/abstract language: "feeling of wonder", "sense of peace"
- Passive voice: "is seen walking" → "walks forward"
- The words "scene", "frame", "clip", "shot"
- Describing what subjects look like — the model sees the image${nextImageUrl ? `

TRANSITION:
Compare the current image and the next image. If they show a continuous action from a similar angle, end the motion moving toward the next image's state. If significantly different (a visual cut), complete the current action naturally and let it settle.` : `

ENDING:
This is the final clip. The main subject completes their current action with a finishing gesture. Motion decelerates naturally. No new actions.`}

Motion must fill the entire ${input.clipDuration}s duration — not finish early, not feel rushed.`;

  const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [];

  contentParts.push({ type: "text", text: "CURRENT FRAME — the video starts from this exact image:" });
  contentParts.push({ type: "image", image: new URL(currentImageUrl) });

  if (nextImageUrl) {
    contentParts.push({ type: "text", text: "\nNEXT FRAME — the video must end transitioning toward this:" });
    contentParts.push({ type: "image", image: new URL(nextImageUrl) });
  }

  let context = `\nNarration context (for story context only — do NOT include dialogue or text): "${input.sceneText}"`;
  context += `\nClip duration: ${input.clipDuration}s`;
  context += `\nMotion policy: ${input.motionPolicy}`;
  if (input.transitionIn) context += `\nTransition style: ${input.transitionIn}`;
  context += `\n\nWrite the motion instructions.`;
  contentParts.push({ type: "text", text: context });

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: singleFrameMotionSchema }),
    system: systemPrompt,
    messages: [{ role: "user", content: contentParts }],
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to generate frame motion");

  return output;
}
