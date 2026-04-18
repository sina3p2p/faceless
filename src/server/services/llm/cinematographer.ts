import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type { CreativeBrief, VisualStyleGuide } from "@/types/pipeline";

export interface CinematographerSceneInput {
  sceneTitle: string;
  text: string;
  directorNote: string;
}

const perSceneSchema = z.object({
  sceneIndex: z.number(),
  lightingOverride: z.string().nullable().describe("Override the global default lighting for this scene, or null to keep default. Use for night scenes, flashbacks, dramatic shifts."),
  paletteOverride: z.array(z.string()).nullable().describe("Override the global color palette for this scene, or null to keep default"),
  environmentMood: z.string().describe("The physical mood of this scene's environment: 'claustrophobic and dim', 'open and sun-drenched'"),
});

const visualStyleGuideSchema = z.object({
  global: z.object({
    medium: z.string().describe("The physical medium of the visual style: 'photorealistic cinematic', 'claymation stop-motion, sculpted clay and plasticine', 'cel-shaded anime'"),
    materialLanguage: z.string().describe("How materials behave in this medium: 'sculpted clay, visible fingerprints, matte finish' or 'smooth cel-shading, flat colors, ink outlines'"),
    colorPalette: z.array(z.string()).describe("3-6 dominant colors for the entire video"),
    cameraPhysics: z.string().describe("Physical camera constraints of this medium: 'static tripod, slow pan only — miniature set' or 'full cinematic range — dolly, crane, handheld'"),
    defaultLighting: z.string().describe("The baseline lighting setup: 'soft diffused, warm key light from upper left'"),
  }),
  promptRegions: z.object({
    subjectPrefix: z.string().describe("Injected BEFORE every subject description in image prompts. Include medium and material. Example: 'Claymation stop-motion style, sculpted clay figure of'"),
    cameraPrefix: z.string().describe("Injected BEFORE every camera instruction. Include physics constraints. Example: 'Static tripod shot,'"),
    lightingPrefix: z.string().describe("Injected BEFORE every lighting instruction. Example: 'Soft diffused studio lighting,'"),
    backgroundPrefix: z.string().describe("Injected BEFORE every background description. Include material language. Example: 'Miniature clay diorama set,'"),
  }),
  perScene: z.array(perSceneSchema),
});

export async function generateVisualStyleGuide(
  scenes: CinematographerSceneInput[],
  brief: CreativeBrief,
  style: string,
  videoType: string,
  model?: string
): Promise<VisualStyleGuide> {
  const primaryModel = model || LLM.cinematographerModel;

  const sceneSummary = scenes.map((s, i) =>
    `Scene ${i} — "${s.sceneTitle}": ${s.directorNote.slice(0, 200)}`
  ).join("\n");

  const systemPrompt = `You are a Cinematographer designing the visual language for a video production.

Your output is a VISUAL STYLE GUIDE that the Prompt Architect and Motion Director will follow exactly. Every image prompt will be assembled using your promptRegions — so they must be precise and concatenation-ready.

VISUAL STYLE: ${style}
VIDEO TYPE: ${videoType}
VISUAL MOOD FROM BRIEF: ${brief.visualMood}
PACING: ${brief.pacingStrategy}

YOUR RESPONSIBILITIES:
1. Define the MEDIUM — what physical material/technique the visuals simulate
2. Define MATERIAL LANGUAGE — how to describe motion and texture in this medium
3. Set CAMERA PHYSICS — what camera moves are physically possible in this medium
4. Create 4 PROMPT REGION PREFIXES that will be concatenated into every image prompt:
   - subjectPrefix: goes before "[character name] [action]"
   - cameraPrefix: goes before "[angle], [shot type]"
   - lightingPrefix: goes before "[source], [direction]"
   - backgroundPrefix: goes before "[elements], [depth]"
5. Set PER-SCENE overrides when the narrative demands different lighting/palette

PROMPT REGION RULES:
- Each prefix must end with a natural join point (comma, space, or period) so the Prompt Architect can append to it
- subjectPrefix must include the medium/material: "Claymation stop-motion style, sculpted clay figure of" not just "clay"
- cameraPrefix must include physics constraints: "Static tripod shot," for stop-motion, or "Cinematic" for realistic
- lightingPrefix should set the baseline: "Soft diffused studio lighting," or "Harsh directional sunlight,"
- backgroundPrefix should include material: "Miniature clay diorama set," or "Photorealistic environment,"

STYLE-SPECIFIC CONSTRAINTS:
- Stop-motion / claymation / lego: NO drone shots, NO handheld shake, NO rack focus, NO fast tracking. Static tripod, slow pans only.
- Realistic / cinematic: full camera range available
- Anime / illustration: compositional framing, no physical camera constraints

PER-SCENE OVERRIDES:
- Only override when the narrative demands it (night scene, flashback, emotional shift)
- null means "use global defaults"
- You MUST have exactly ${scenes.length} entries in perScene, one per scene`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: visualStyleGuideSchema }),
    system: systemPrompt,
    prompt: `Design the visual style guide for these ${scenes.length} scenes:\n\n${sceneSummary}`,
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to generate visual style guide");

  return output;
}
