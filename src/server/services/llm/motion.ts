import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type { MotionDirectorInput } from "@/lib/types";

// ── Motion Agent Schema ──

const singleFrameMotionSchema = z.object({
  visualDescription: z.string().describe("Motion instructions for an AI video model. Describe ONE rich primary action with precise body mechanics, natural secondary motion, and camera movement. Must be achievable in a single short clip — quality over quantity."),
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
    static: "Environmental motion ONLY (wind, particles, light shifts). NO subject movement. Camera locked or imperceptible drift. Describe the environmental detail richly.",
    subtle: "ONE small gesture with precise body mechanics — breathing, weight shift, blink, gentle hand movement. Natural secondary physics (hair sway, cloth settle). Camera may drift.",
    moderate: "ONE clear primary action described with full body mechanics and physical detail. Natural secondary physics (hair, cloth, object reactions). Camera may track or pan slowly.",
    dynamic: "ONE strong primary action with rich body mechanics — describe the muscle engagement, weight transfer, follow-through. Natural secondary physics. Camera can dolly, pan, or arc.",
    frenetic: "ONE fast, intense primary action with explosive body mechanics — snap, thrust, whip. Natural reactive physics from the force. Dramatic camera move.",
  };

  const cameraConstraint = input.cameraPhysics
    ? `\nCAMERA PHYSICS: ${input.cameraPhysics} — your camera moves MUST respect these physical constraints.`
    : "";

  const materialConstraint = input.materialLanguage
    ? `\nMATERIAL LANGUAGE: Describe motion using this material's physics: "${input.materialLanguage}". Example: "sculpted clay arm extends" not "arm reaches forward".`
    : "";

  const systemPrompt = `You are a motion director for an AI video generation model. The model receives ONE starting image and your text instructions. It renders visible physical motion for a ${input.clipDuration}s clip.

CORE PRINCIPLE: AI video models execute ONE action well. Asking for many actions produces garbled, morphing artifacts. Focus all your descriptive power on making ONE action look incredible — rich body mechanics, precise physics, purposeful camera work.

MOTION POLICY: ${input.motionPolicy.toUpperCase()}
${motionIntensity[input.motionPolicy]}
${cameraConstraint}${materialConstraint}

WHAT TO DESCRIBE:
1. PRIMARY ACTION — ONE dominant action. Describe it with precision and physical detail: body mechanics, weight, momentum, follow-through. Use specific directions, speeds, and body part positions. Make it vivid.
2. NATURAL PHYSICS — Secondary motions that would physically result from the primary action (hair reacting to a head turn, cloth settling after a step, an object wobbling after being set down). These make the motion feel real.
3. CAMERA — One clear camera instruction with direction and speed.

QUALITY RULES:
- SPECIFIC BODY MECHANICS: "lifts left hand to forehead, fingers spread, elbow rising to shoulder height" not "raises hand"
- DIRECTIONAL: "slides left-to-right" not "moves across"
- SPEED CUES: "snaps head right suddenly" vs "slowly rotates head to the right"
- PHYSICAL DETAIL matters — describe how weight shifts, how fabric drapes, how light catches a surface during movement
- Let secondary motions flow naturally from the primary action — don't choreograph them separately

WHAT TO AVOID:
- Multiple unrelated primary actions (walk + pick up + talk + turn = garbled output)
- Step-by-step choreography listing every micro-movement in sequence
- Describing appearance — the model already sees the image
- Abstract/emotional language ("feeling of wonder")
- Passive voice ("is seen walking" → "walks forward")
- The words "scene", "frame", "clip", "shot"${nextImageUrl ? `

TRANSITION: End the motion moving toward the next image's state if angles are similar. If significantly different, settle the current action naturally.` : `

ENDING: Complete the action with natural deceleration. No new actions start.`}

Aim for 40-80 words. Every word should serve the motion — dense and precise, not padded or sparse.`;


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
