import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter, buildAssetBlock, type StoryAsset } from "./index";
import type { VisualStyleGuide, FrameBreakdown, ContinuityNotes } from "@/lib/types";

// ── Image Prompt Agent Schemas ──

const framePromptSchema = z.object({
  imagePrompt: z.string().describe("Structured image generation prompt assembled from upstream style regions and frame specs"),
  assetRefs: z.array(z.string()).default([]).describe("Asset names from story assets that appear in this frame"),
  clipDuration: z.number().describe("Duration in seconds — pre-determined by Storyboard, pass through unchanged"),
});

const sceneFramePromptsSchema = z.object({
  frames: z.array(framePromptSchema),
});

const framePromptsOutputSchema = z.object({
  scenes: z.array(sceneFramePromptsSchema),
});

export type FramePromptsOutput = z.infer<typeof framePromptsOutputSchema>;

// ── Prompt Architect (strict translator contract) ──

export async function generateFramePrompts(
  scenes: Array<{ text: string; directorNote: string; sceneTitle: string }>,
  assets: StoryAsset[],
  styleGuide: VisualStyleGuide,
  frameBreakdown: FrameBreakdown,
  continuity: ContinuityNotes,
  model?: string
): Promise<FramePromptsOutput> {
  const primaryModel = model || LLM.promptModel;

  const scenesContext = scenes.map((s, i) => {
    const sceneFrames = frameBreakdown.scenes[i]?.frames ?? [];
    const frameSpecs = sceneFrames.map((f, fi) =>
      `    Frame ${fi}: ${f.clipDuration}s, ${f.shotType}, intent=${f.narrativeIntent}, motion=${f.motionPolicy}, subject="${f.subjectFocus}"`
    ).join("\n");
    return `Scene ${i} — "${s.sceneTitle}":\n  Narration: "${s.text}"\n  Director: ${s.directorNote}\n  Frame specs:\n${frameSpecs}`;
  }).join("\n\n");

  const characterBlock = continuity.characterRegistry.length > 0
    ? `\nCHARACTER REGISTRY (use canonicalName EXACTLY — NEVER use aliases):\n${continuity.characterRegistry.map((c) =>
        `  - "${c.canonicalName}" (aliases to AVOID: ${c.aliases.length > 0 ? c.aliases.join(", ") : "none"})${c.assetRef ? ` [has reference image — do NOT describe appearance]` : ` appearance: ${c.appearance.clothing}, ${c.appearance.hair}, ${c.appearance.distinguishingFeatures}`}`
      ).join("\n")}`
    : "";

  const perSceneOverrides = styleGuide.perScene.map((ps) => {
    const parts = [];
    if (ps.lightingOverride) parts.push(`lighting: ${ps.lightingOverride}`);
    if (ps.paletteOverride) parts.push(`palette: ${ps.paletteOverride.join(", ")}`);
    parts.push(`mood: ${ps.environmentMood}`);
    return `  Scene ${ps.sceneIndex}: ${parts.join("; ")}`;
  }).join("\n");

  const systemPrompt = `You are a TRANSLATOR. You convert pre-made creative decisions into image generation prompt syntax.

You CANNOT change:
- Shot type (given by Storyboard — use the exact shotType for each frame)
- Subject focus (given by Storyboard — the subjectFocus must dominate the frame)
- Clip duration (given by Storyboard — pass through unchanged)
- Character names (given by Continuity — use canonicalName exactly, NEVER aliases)
- Style language (given by Cinematographer — use promptRegions verbatim as prefixes)

You CAN decide:
- Specific pose/action within the narrativeIntent
- Background element selection (max 2 elements)
- Spatial composition within the shotType constraint
- Color temperature within the palette

STYLE REGIONS (concatenate these into every prompt):
- Subject prefix: "${styleGuide.promptRegions.subjectPrefix}"
- Camera prefix: "${styleGuide.promptRegions.cameraPrefix}"
- Lighting prefix: "${styleGuide.promptRegions.lightingPrefix}"
- Background prefix: "${styleGuide.promptRegions.backgroundPrefix}"

GLOBAL PALETTE: ${styleGuide.global.colorPalette.join(", ")}
MEDIUM: ${styleGuide.global.medium}

PER-SCENE OVERRIDES:
${perSceneOverrides}
${characterBlock}

OUTPUT FORMAT — each imagePrompt MUST follow this structure:
{subjectPrefix} [canonicalName] [pose/action matching narrativeIntent].
Camera: {cameraPrefix} [composition matching shotType].
Lighting: {lightingPrefix} [application of scene lighting or global default].
Background: {backgroundPrefix} [1-2 elements], [depth of field].
Color palette: [2-4 colors from global palette or scene override].

FRAME COUNTS — you MUST produce exactly the number of frames specified per scene:
${frameBreakdown.scenes.map((s, i) => `  Scene ${i}: ${s.frames.length} frames`).join("\n")}

SUBJECT RULES:${assets.length > 0 ? `
- Characters with reference images (assetRef is set): reference by NAME only — do NOT describe appearance
- Characters without reference images: use the appearance from the character registry` : `
- Describe characters with age, ethnicity, clothing, expression, body language`}
- The subjectFocus character must be the clear focal point through framing, focus, or placement

NARRATIVE INTENT → POSE MAPPING:
- introduce: character enters or is revealed — show them in a characteristic pose
- build: tension increases — lean forward, narrow eyes, grip objects
- climax: peak moment — explosive action, dramatic gesture
- react: response to an event — surprise, relief, fear, joy expressed physically
- transition: bridging — walking, turning, looking toward something new
- resolve: conclusion — relaxing posture, letting go, settling

NO COPYRIGHTED CONTENT — reimagine with original details.
${buildAssetBlock(assets)}
You MUST return exactly ${scenes.length} scenes.`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: framePromptsOutputSchema }),
    system: systemPrompt,
    prompt: `Create image prompts for each frame:\n\n${scenesContext}`,
    temperature: 0.8,
  });
  if (!output) throw new Error("Failed to generate frame prompts");

  return output;
}
