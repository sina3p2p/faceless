import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter, buildAssetBlock, type StoryAsset } from "./index";

// ── Image Prompt Agent Schemas ──

const framePromptSchema = z.object({
  imagePrompt: z.string().describe("Structured image generation prompt. Format: Subject + action. Camera: angle, shot type. Lighting: source, direction, quality. Background: simple, depth of field. Color palette. Style. Reference characters by name only — do NOT describe their appearance."),
  assetRefs: z.array(z.string()).default([]).describe("Asset names from story assets that appear in this frame"),
  clipDuration: z.number().describe("Duration in seconds for this video clip. Must be one of the supported clip durations."),
});

const sceneFramePromptsSchema = z.object({
  frames: z.array(framePromptSchema),
});

const framePromptsOutputSchema = z.object({
  scenes: z.array(sceneFramePromptsSchema),
});

export type FramePromptsOutput = z.infer<typeof framePromptsOutputSchema>;

// ── Image Prompt Agent ──

export async function generateFramePrompts(
  scenes: Array<{ text: string; directorNote: string; sceneTitle: string; ttsDuration: number }>,
  style: string,
  niche: string,
  assets: StoryAsset[],
  sceneContinuity: boolean,
  supportedClipDurations: number[],
  model?: string
): Promise<FramePromptsOutput> {
  const primaryModel = model || LLM.promptModel;

  const scenesContext = scenes.map((s, i) =>
    `Scene ${i + 1} — "${s.sceneTitle}" (audio: ${s.ttsDuration.toFixed(1)}s):\n  Narration: "${s.text}"\n  Director's Note: ${s.directorNote}`
  ).join("\n\n");

  // Pre-calculate frame splits in code so the LLM doesn't have to do math
  const frameSplits = scenes.map((s) => {
    const totalDuration = s.ttsDuration;
    const sorted = [...supportedClipDurations].sort((a, b) => b - a);
    const frames: number[] = [];
    let remaining = totalDuration;
    while (remaining > 0) {
      const best = sorted.find((d) => d <= remaining + 0.5) || sorted[sorted.length - 1];
      frames.push(best);
      remaining -= best;
    }
    if (frames.length === 0) frames.push(sorted[sorted.length - 1]);
    return frames;
  });

  const scenesWithSplits = scenes.map((s, i) =>
    `Scene ${i + 1} — "${s.sceneTitle}" (audio: ${s.ttsDuration.toFixed(1)}s) → ${frameSplits[i].length} frames: ${frameSplits[i].map((d) => `${d}s`).join(" + ")}`
  ).join("\n");

  const systemPrompt = `You create image generation prompts for video frames. You receive scenes with pre-calculated frame splits. Your ONLY job is to write the imagePrompt for each frame.

PRIORITY ORDER (most important first):
1. SUBJECT DOMINANCE — The main subject must be the clear focal point of every frame. Everything else exists to support them.
2. ACTION CLARITY — One PRIMARY subject doing one clear action per frame. A secondary subject is allowed ONLY when the narration requires direct interaction (e.g. handing an object, talking to someone). The primary subject must still dominate.
3. CAMERA — Specific angle and shot type that serves the action.
4. LIGHTING — Directional, with source specified.
5. BACKGROUND — Minimal. Exists only to establish location. Must not compete with the subject.
6. STYLE — ${style}. Must appear in every prompt.

FRAME ASSIGNMENT (pre-calculated — use these exactly):
${scenesWithSplits}
Use these frame counts and durations exactly. Do NOT recalculate.

IMAGE PROMPT FORMAT — each imagePrompt MUST follow this structure:

${style} style. [Subject name] + [specific action/pose with body parts described].
Camera: [angle], [shot type], [framing detail that keeps subject dominant].
Lighting: [source], [direction], [quality], [color temperature].
Background: [1-2 elements ONLY], shallow depth of field.
Color palette: [2-4 colors].

SUBJECT RULES:${assets.length > 0 ? `
- Reference characters by NAME only (e.g. "Tommy stands confidently"). Do NOT describe their physical appearance — the image model receives reference images. Describing appearance conflicts with the reference.` : `
- For people without reference images: describe age, ethnicity, clothing, facial expression, body language, hair.`}
- The subject must be the clear focal point — through framing, focus, contrast, or placement. They don't have to be the largest element, but the viewer's eye must go to them first.
- Describe actions using the visual language of the art style. For stylized styles (claymation, lego, etc.), describe movement through the material: "sculpted clay arm extends outward", "brick-built hand grips the handle." For realistic styles, use standard body mechanics: "left arm reaches forward, fingers spread."
- When a subject appears in consecutive frames, keep them on the SAME side of the frame (screen direction consistency). If they face left in frame 1, they face left in frame 2.

BACKGROUND RULES:
- Maximum 2 background elements. No more.
- For medium and close-up shots: use "shallow depth of field" to keep background secondary.
- For wide and establishing shots: use "deep focus" so the full environment is visible and sharp. The background is part of the storytelling in wide shots.
- If the narration mentions many objects, pick the single most visually important one.

CAMERA RULES:
- Every frame MUST specify angle + shot type + framing: "low angle medium shot, subject centered, looking up" not just "medium shot".
- For multi-frame scenes: vary camera across frames — use whatever progression serves the story (wide → close, close → wide, or mixed). Do NOT default to wide → medium → close-up every time. For single-frame scenes: choose the angle that best serves the action.

LIGHTING CONTINUITY:
- Within the same scene (same sceneOrder), all frames must share the same time of day and primary light source. If frame 1 uses "warm golden hour sunlight from the left", frame 2 and 3 must use the same.
- Light direction and color temperature can only change between scenes, not within a scene.

AVOID:
- Multiple competing focal points in one frame.
- Split-screen, collage, or multi-panel layouts.
- Same action from the same angle in consecutive frames.

NO COPYRIGHTED CONTENT:
- NEVER use copyrighted character names or their iconic signature details in imagePrompt.
- Reimagine with ORIGINAL details. The narration text may use real names.
${["claymation", "gothic-clay"].includes(style) ? `
CLAYMATION STYLE: Every subject must look handcrafted from clay/plasticine. Visible fingerprint marks, rounded edges, matte finish. Miniature diorama sets. Always include: "Claymation stop-motion style, sculpted clay and plasticine"` : ""}${style === "gothic-clay" ? `
GOTHIC CLAY: Dark moody atmosphere — gothic arches, gray/purple clay, candelabras, cobwebs. Deep purples, dark greens, midnight blues.` : ""}${style === "lego" ? `
LEGO STYLE: Everything built from LEGO bricks. Minifigures with cylindrical heads, C-shaped hands. Visible studs, ABS plastic sheen. Bold primary colors. Always include: "LEGO brick style, plastic toy aesthetic"` : ""}
${sceneContinuity ? `SCENE CONTINUITY: The same main subject must be recognizable across consecutive frames — same position in frame, same clothing, same proportions.` : ""}${buildAssetBlock(assets)}

You MUST return exactly ${scenes.length} scenes with the exact frame counts specified above.`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: framePromptsOutputSchema }),
    system: systemPrompt,
    prompt: `Create storyboard frames for each scene:\n\n${scenesContext}\n\nVisual style: ${style}. Niche: ${niche}.`,
    temperature: 0.8,
  });
  if (!output) throw new Error("Failed to generate frame prompts");

  return output;
}
