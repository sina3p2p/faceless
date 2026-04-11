import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";

// ── Motion Agent Schema ──

const singleFrameMotionSchema = z.object({
  visualDescription: z.string().describe("Detailed motion instructions for an AI video model. Describe exactly what every visible subject physically does — body movement, facial expressions, hand gestures, object interactions — plus environment motion and camera direction."),
});

export type SingleFrameMotionOutput = z.infer<typeof singleFrameMotionSchema>;

// ── Motion Agent (per-frame: current image + next image → visualDescription) ──

export async function generateSingleFrameMotion(
  frame: {
    imagePrompt: string;
    clipDuration: number;
    sceneText: string;
    directorNote: string;
    sceneTitle: string;
  },
  style: string,
  currentImageUrl: string,
  nextImageUrl: string | null,
  model?: string
): Promise<SingleFrameMotionOutput> {
  const primaryModel = model || LLM.motionModel;

  const systemPrompt = `You are a motion director for an AI video generation model. The model receives ONE starting image and your text instructions. It cannot read, think, or understand story — it only renders visible physical motion. Your job: describe exactly what moves and how.

PRIORITIES — describe in this order:
1. SUBJECT ACTIONS: What does each person/character/animal physically do? Be specific about body parts — arms, hands, fingers, eyes, mouth, head, legs, torso. Name subjects by appearance ("the curly-haired boy", "the woman in red"), not by role.
2. OBJECT INTERACTIONS: How objects move, get used, react to forces — gravity, wind, contact.
3. ENVIRONMENT MOTION: Wind, rain, particles, light shifts, liquid, fire, cloth, hair.
4. CAMERA: Direction, speed, type of move. Be precise — "slow steady dolly forward over the full duration" not just "push in".

WHAT MAKES A GOOD MOTION PROMPT:
- SPECIFIC BODY MECHANICS: "lifts left hand to forehead, fingers spread, palm facing out" not "raises hand"
- PRECISE OBJECT PHYSICS: "the red ball bounces twice on the wooden floor, each bounce lower" not "ball bounces"
- DIRECTIONAL MOVEMENT: "slides left-to-right across the counter" not "moves across"
- SPEED CUES: "snaps head right suddenly" vs "slowly rotates head to the right over the full duration"
- SEQUENTIAL ACTIONS: "first reaches for the handle, then pulls the door open, then steps through" — describe the order things happen

BANNED:
- Emotional/abstract language the model cannot render: "feeling of wonder", "sense of peace", "magical atmosphere"
- Passive voice: "is seen walking" → "walks forward"
- The words "scene", "frame", "clip", "shot" in the description
- Describing what subjects look like — the model already sees the image${nextImageUrl ? `

TRANSITION:
The motion must end moving toward what the NEXT frame shows. Look at the next image — if it shows a different angle, location, or subject state, design the motion to bridge there. End with movement in that direction.` : `

ENDING:
This is the final clip. The main subject completes their current action — a finishing gesture, a settling pose. Motion decelerates naturally. Do not add new actions.`}

Clip duration: ${frame.clipDuration}s. The motion must fill this entire duration — not finish early, not feel rushed. Pace the actions accordingly.`;

  const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [];

  contentParts.push({ type: "text", text: "CURRENT FRAME — the video starts from this exact image:" });
  contentParts.push({ type: "image", image: new URL(currentImageUrl) });

  if (nextImageUrl) {
    contentParts.push({ type: "text", text: "\nNEXT FRAME — the video must end transitioning toward this:" });
    contentParts.push({ type: "image", image: new URL(nextImageUrl) });
  }

  let context = `\nScene: "${frame.sceneTitle}"`;
  context += `\nNarration (for story context only — do NOT include dialogue or text in the motion): "${frame.sceneText}"`;
  context += `\nDirector's intent: ${frame.directorNote}`;
  context += `\nClip duration: ${frame.clipDuration}s`;
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
