import { Output } from "ai";
import { generateText } from "@/server/services/ai-audit";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { buildStoryAssetVisionContentParts } from "@/server/services/story-asset-tools";
import { openrouter, type StoryAsset } from "./index";
import type { CreativeBrief, VisualStyleGuide } from "@/types/pipeline";

export interface CinematographerSceneInput {
  sceneTitle: string;
  text: string;
  directorNote: string;
}

const STYLE_CONSTRAINTS: Record<string, string> = {
  cinematic: `Realistic / cinematic: full camera range available — dolly, crane, handheld, rack focus, drone all on the table. Photographic medium with real-world lighting physics.`,
  pixar: `Pixar / 3D render: full virtual camera range. Stylized but physically grounded materials (subsurface scattering on skin, soft global illumination). Lean into expressive proportions and exaggerated key-light shaping; avoid photoreal-uncanny territory.`,
  anime: `Anime / cel-shaded: compositional framing, no physical camera constraints. Flat colors, ink outlines, cel shading. Use anime vocabulary (key animation, speedlines, screen tones) — not photographic terms.`,
  watercolor: `Watercolor: painterly medium. No camera physics — describe compositions like a painting (vignette, washes, paper grain, bleed edges). Avoid photographic lighting jargon.`,
  cartoon: `Cartoon / 2D animation: bold ink outlines, flat colors, no rendered DOF. Compositional framing, not physical camera. Avoid realistic lighting setups.`,
  minimal: `Minimal: limited palette (2–4 colors), generous negative space, geometric shapes. Treat camera as compositional framing, not physical.`,
  dark: `Dark & moody photoreal: full camera range. Strongly directional, low-key lighting; deep shadows; restrained desaturated palette. Avoid flat lighting.`,
  claymation: `Stop-motion claymation: NO drone shots, NO handheld shake, NO rack focus, NO fast tracking. Static tripod, slow pans only. Sculpted clay/plasticine medium with visible fingerprints, matte finish.`,
  "gothic-clay": `Stop-motion gothic claymation: NO drone shots, NO handheld shake, NO rack focus, NO fast tracking. Static tripod, slow pans only. Dark sculpted clay/plasticine with cracked, weathered surfaces; cold key, deep shadows.`,
  lego: `Lego (Lego Movie aesthetic): hybrid world — only diegetic objects are brick-built; the natural world is NOT. Bake this into the actual fields:
  * global.medium → e.g. "Lego Movie style — brick-built minifigures, vehicles, and architecture set in a photoreal/painterly natural world (non-brick sky, sun, clouds, water, fire, smoke, atmospheric haze)"
  * global.materialLanguage → describe ABS plastic studs/tubes/clutch power for built objects, AND explicitly call out that sky, sun, clouds, water, fire, smoke, dust, sparks, lens flares, and lighting effects render as photographic/painterly — never as bricks or studs
  * global.cameraPhysics → cinematic virtual camera is fine (dolly, crane, pan, push-in); the films use full camera language. Avoid only the obvious stop-motion tropes.
  * promptRegions.subjectPrefix → "Lego minifigure / brick-built" applies to the SUBJECT only
  * promptRegions.backgroundPrefix → must explicitly state that sky, sun, clouds, and weather are NOT made of bricks (e.g. "Brick-built set pieces against a photoreal sky with a real (non-brick) sun and natural clouds,")`,
};

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
  model: string,
  assets: StoryAsset[] = []
): Promise<VisualStyleGuide> {
  const sceneSummary = scenes.map((s, i) =>
    `Scene ${i} — "${s.sceneTitle}": ${s.directorNote}`
  ).join("\n");

  const styleConstraint =
    STYLE_CONSTRAINTS[style] ??
    `Style "${style}": follow the spirit of the named style; choose camera physics, medium, and material language that fit it.`;

  const cinematicSpecBlock = brief.cinematicSpec
    ? `

CINEMATIC SPEC FROM PRODUCER (LOCKED — your style guide must be consistent with these technical anchors; do not contradict them):
- Lighting style: ${brief.cinematicSpec.lightingStyle}
- Color temperature: ${brief.cinematicSpec.colorTemperatureK}K (${brief.cinematicSpec.colorTemperatureK <= 3500
      ? "warm — golden hour / tungsten / candlelight"
      : brief.cinematicSpec.colorTemperatureK <= 5000
        ? "neutral-warm — overcast / mixed practical"
        : brief.cinematicSpec.colorTemperatureK <= 6500
          ? "daylight neutral"
          : "cool — moonlit / cold shadow"
    })
- Lens focal length: ${brief.cinematicSpec.lensFocalMm}mm (${brief.cinematicSpec.lensFocalMm <= 28
      ? "wide / environmental"
      : brief.cinematicSpec.lensFocalMm <= 40
        ? "natural-wide"
        : brief.cinematicSpec.lensFocalMm <= 60
          ? "natural"
          : brief.cinematicSpec.lensFocalMm <= 100
            ? "portrait / intimate"
            : "compressed / voyeuristic"
    })
- Depth of field: ${brief.cinematicSpec.depthOfField}
- Camera movement vocabulary: ${brief.cinematicSpec.cameraMovement}
- Aspect mood: ${brief.cinematicSpec.aspectMood}

Bake these into:
- global.defaultLighting (must echo the lightingStyle and the Kelvin anchor)
- global.cameraPhysics (must reflect the camera movement vocabulary)
- promptRegions.lightingPrefix (open with the locked lighting setup)
- promptRegions.cameraPrefix (open with the lens focal length and DoF, then the movement vocabulary)`
    : "";

  const systemPrompt = `You are a Cinematographer designing the visual language for a video production.

Your output is a VISUAL STYLE GUIDE that the Prompt Architect and Motion Director will follow exactly. Every image prompt will be assembled using your promptRegions — so they must be precise and concatenation-ready.

VISUAL STYLE: ${style}
VIDEO TYPE: ${videoType}
VISUAL MOOD FROM BRIEF: ${brief.visualMood}
PACING: ${brief.pacingStrategy}${cinematicSpecBlock}

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

STYLE-SPECIFIC CONSTRAINTS (only the rules for the selected style — apply them):
${styleConstraint}

PER-SCENE OVERRIDES:
- Only override when the narrative demands it (night scene, flashback, emotional shift)
- null means "use global defaults"
- You MUST have exactly ${scenes.length} entries in perScene, one per scene
${assets.length > 0 ? `\nSTORY ASSET REFERENCES: When images are attached in the user message, align global colorPalette, materialLanguage, and defaultLighting with the dominant look of those assets while staying faithful to VISUAL STYLE and the brief.` : ""}`;

  const stylePrompt = `Design the visual style guide for these ${scenes.length} scenes:\n\n${sceneSummary}`;
  const visionParts = assets.length > 0 ? await buildStoryAssetVisionContentParts(assets) : [];

  const { output } = await generateText({
    model: openrouter.chat(model),
    output: Output.object({ schema: visualStyleGuideSchema }),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [...visionParts, { type: "text", text: stylePrompt }],
      },
    ],
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to generate visual style guide");

  return output;
}
