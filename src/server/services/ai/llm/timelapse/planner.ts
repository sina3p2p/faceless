import { generateText, Output } from "ai";
import { z } from "zod";
import { recordAiCall } from "@/server/services/ai-audit";
import { LLM } from "@/lib/constants";
import { openrouter } from "../index";
import type { TimelapsePlan } from "@/types/pipeline";

const stageSchema = z.object({
  stageIndex: z.number().int().min(0).describe("0-based stage order. Stage 0 is the empty/initial state."),
  stageDescription: z.string().describe("One-sentence label of what this stage shows. Used for review UI only — not fed to image/video models."),
  imagePrompt: z.string().describe(
    "Image-generation prompt describing the visible state of the worksite at this stage. MUST weave in the locked vantage and the unchanging environmental anchors so the image model reproduces the same camera position and skyline as every other stage. Focus on what is built / cleaned / changed at this stage; the camera position itself never changes."
  ),
  ambientMotion: z.string().describe(
    "The dominant ambient motion at THIS stage, as a single beat. Examples: 'excavator buckets swing in a steady rhythm, dust plumes rising from the trench', 'a long line of concrete mixer trucks rolls along the access road as the pump-arm cascades concrete into the formwork', 'workers in high-vis vests crisscross the rebar grid carrying tools, sparks fly from welders'. The camera is locked — describe SUBJECT motion only, never camera motion."
  ),
  voiceoverLine: z.string().describe(
    "Optional 1-2 sentence narration line for this stage. Empty string if no narration. Keep it short and observational ('Excavators carve the foundation pit through autumn'); avoid dramatic narrative language."
  ),
  durationSeconds: z.number().int().min(3).max(10).describe(
    "Target seconds for this stage's clip. Default 5; use 7-10 for stages with rich visible activity, 3-4 for quick beats. Will be clamped to model-supported durations."
  ),
});

const planSchema = z.object({
  lockedVantage: z.string().describe(
    "1-2 sentence anchor describing the EXACT camera position, framing, distance, height, angle, AND the unchanging environmental anchors (skyline, distant buildings, mountains, signature trees, road curves, terrain edges) that every frame in the video must reproduce. Example: 'Elevated drone shot ~30 meters up, looking down-and-east over a riverside lot at the edge of a small city. The same suburban skyline sits on the horizon line, a row of poplar trees frames the right edge, and a curved access road wraps around the bottom-left.' This vantage is what makes cuts read as time-jumps on a single tripod."
  ),
  processName: z.string().describe("Short label of the process: '30-story tower construction', 'cargo ship hull cleaning', 'wheat field through four seasons'."),
  setting: z.string().describe("1-2 sentences describing the location and unchanging surroundings."),
  stages: z.array(stageSchema).min(3).max(20).describe(
    "Ordered list of stages, 3 to 20 entries. Stage 0 should be the initial/empty state at the locked vantage. Subsequent stages each add one major visible change. The final stage shows the completed/resolved state. Stages should feel like real time-skips (days/weeks/seasons apart), not narrative beats."
  ),
});

export type TimelapsePlanResult = z.infer<typeof planSchema>;

export async function generateTimelapsePlan(params: {
  prompt: string;
  style: string;
  language: string;
  totalDurationSeconds: number;
  model?: string;
}): Promise<TimelapsePlan> {
  const { prompt, style, language, totalDurationSeconds, model } = params;
  const primaryModel = model || LLM.cinematographerModel;

  const systemPrompt = `You are a Timelapse Planner. The user wants a stage-by-stage timelapse video documenting a real-world process — construction, cleaning, growth, decay, restoration, weather/seasonal change, etc.

Your job is to produce a complete plan in ONE call:
1. Pick the LOCKED VANTAGE that the entire video will be shot from (this is non-negotiable for timelapse — every stage uses the SAME camera position, framing, and skyline anchors). Choose a vantage that flatters the process: usually elevated drone or an elevated fixed observation deck, far enough back to see the whole site, close enough that the action is legible.
2. Identify the unchanging environmental anchors flanking the action — skyline, distant city, mountains, signature trees, road curves — and weave them into the lockedVantage description so they read as "the world around the process."
3. Break the process into 5-12 STAGES (typically 6-9 is right). Each stage = one visible state change (e.g. for construction: empty lot → excavation → foundation → rebar → concrete pour → framework rising → floors filling → façade → finished). Each stage gets one image and one short clip.
4. For each stage's imagePrompt: describe what is BUILT/CHANGED at this stage, AND repeat the locked-vantage framing + skyline anchors so the image model regenerates the same vantage. Do NOT describe camera moves; the camera is locked.
5. For each stage's ambientMotion: name the dominant ambient activity HAPPENING at this stage in real-time — workers moving, machinery operating, dust/smoke/water/sparks. ONE beat. The video model receives this as the i2v prompt; the camera is static.
6. Write a brief voiceoverLine for each stage IF the user implied narration; otherwise leave them empty strings (silent timelapse with music is fine).

CRITICAL RULES:
- The camera NEVER moves between stages or within a clip. Cuts are time-jumps; ambient motion fills each clip; the vantage is fixed.
- Stages should feel like real time-skips (days, weeks, seasons), not narrative beats. Don't write a story — document a process.
- ambientMotion describes SUBJECT motion only. NEVER describe camera moves there.
- Match the chosen visual style: ${style}. Apply that style to imagePrompts (e.g. "anime aesthetic, cel-shaded" or "photoreal cinematic"); keep camera physics observational.
- Voiceover language: ${language}. Voiceover lines should be SHORT and observational, not dramatic.
- Total target duration: ~${totalDurationSeconds}s. Sum of stage durationSeconds should land near this target; trim or add stages to fit.

Be CONCRETE about places, materials, and equipment specific to the user's process. Don't be generic.`;

  const userPrompt = `User request: ${prompt}\n\nProduce the timelapse plan as structured output.`;

  const { output } = await recordAiCall(
    {
      provider: "openrouter",
      model: primaryModel,
      operation: "llm.generateTimelapsePlan",
      request: {
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.6,
        schema: "timelapsePlanSchema",
      },
    },
    () =>
      generateText({
        model: openrouter.chat(primaryModel),
        output: Output.object({ schema: planSchema }),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.6,
      }),
  );
  if (!output) throw new Error("Failed to generate timelapse plan");

  return {
    lockedVantage: output.lockedVantage,
    processName: output.processName,
    setting: output.setting,
    stages: output.stages.map((s, i) => ({
      stageIndex: i,
      stageDescription: s.stageDescription,
      imagePrompt: s.imagePrompt,
      ambientMotion: s.ambientMotion,
      voiceoverLine: s.voiceoverLine.trim() ? s.voiceoverLine : undefined,
      durationSeconds: s.durationSeconds,
    })),
  };
}
