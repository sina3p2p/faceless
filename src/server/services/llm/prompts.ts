/** Machine-checked prompt rules / status: see `prompt-contract.ts` + `image-spec.ts`. */
import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter, buildAssetBlock, type StoryAsset } from "./index";
import type { VisualStyleGuide, FrameBreakdown, ContinuityNotes } from "@/lib/types";
import {
  imageSpecSchema,
  mergeImageSpecWithUpstreamSubject,
  serializeFrameImageSpec,
  type ImageSpec,
} from "./image-spec";
import { assembleSubjectIdentityFromFrame, normalizeSubjectIdentity } from "./prompt-contract";

// ── Image Prompt Agent (LLM outputs structured spec; we serialize deterministically) ──

const frameLlmSchema = z.object({
  imageSpec: imageSpecSchema.describe(
    "Structured visual spec — subject.primary will be replaced by continuity-safe name when serializing"
  ),
  assetRefs: z.array(z.string()).default([]).describe("Asset names from story assets visible in this frame"),
  clipDuration: z.number().describe("Seconds from storyboard — pass through unchanged"),
});

const sceneFramePromptsSchema = z.object({
  frames: z.array(frameLlmSchema),
});

const framePromptsLlmOutputSchema = z.object({
  scenes: z.array(sceneFramePromptsSchema),
});

export type FramePromptRecord = {
  imageSpec: ImageSpec;
  imagePrompt: string;
  assetRefs: string[];
  clipDuration: number;
};

export type FramePromptsOutput = {
  scenes: Array<{ frames: FramePromptRecord[] }>;
};

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

  const systemPrompt = `You are a TRANSLATOR. You convert pre-made creative decisions into a STRUCTURED image spec (JSON). The system will serialize it into the final prompt using locked style prefixes and storyboard shot types.

You CANNOT change:
- Shot type (storyboard shotType is injected at serialize time — do not contradict it in prose)
- Subject identity (canonical name from continuity replaces subject.primary when serializing)
- Clip duration (pass through unchanged)
- Character names (use canonicalName in subject.primary as placeholder; aliases forbidden)
- Style medium / prompt region wording (prefixes are injected at serialize time)

You CAN decide (in imageSpec fields):
- action: pose / beat within narrativeIntent
- shot.angle, shot.composition, shot.depthOfField (not shot type label)
- environment.setting, background, effects
- lighting key / accent / practicals
- style.palette subset (must stay within global or per-scene palette family)
- constraints and negativeCues (avoid copyright etc.)

STYLE CONTEXT (serialization injects these prefixes verbatim — do not repeat them as long prose):
- Subject prefix: "${styleGuide.promptRegions.subjectPrefix}"
- Camera prefix: "${styleGuide.promptRegions.cameraPrefix}"
- Lighting prefix: "${styleGuide.promptRegions.lightingPrefix}"
- Background prefix: "${styleGuide.promptRegions.backgroundPrefix}"

GLOBAL PALETTE: ${styleGuide.global.colorPalette.join(", ")}
MEDIUM: ${styleGuide.global.medium}

PER-SCENE OVERRIDES:
${perSceneOverrides}
${characterBlock}

imageSpec SHAPE:
- subject.primary: canonical character name or focal subject label matching subjectFocus
- subject.focus: optional framing emphasis (does not replace identity)
- subject.secondary: optional secondary entities (max 2)
- action: one clear pose/action line
- environment / lighting / style: optional detail objects
- constraints: short safety/originality notes
- negativeCues: things to avoid (serialized as "Avoid: ...")

FRAME COUNTS — you MUST produce exactly the number of frames specified per scene:
${frameBreakdown.scenes.map((s, i) => `  Scene ${i}: ${s.frames.length} frames`).join("\n")}

SUBJECT RULES:${assets.length > 0 ? `
- Characters with reference images (assetRef): do NOT describe appearance in any field
- Characters without reference images: you may hint wardrobe in environment/action, not long appearance lists` : `
- Describe characters with age, ethnicity, clothing where needed`}
- subjectFocus must remain the clear focal subject in subject.primary

NARRATIVE INTENT → ACTION HINTS:
- introduce: reveal, characteristic pose
- build: tension, lean in, grip objects
- climax: peak gesture
- react: emotional physical response
- transition: move, turn, look toward
- resolve: release, settle

NO COPYRIGHTED CONTENT — reimagine with original details.
${buildAssetBlock(assets)}
You MUST return exactly ${scenes.length} scenes.`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: framePromptsLlmOutputSchema }),
    system: systemPrompt,
    prompt: `Create structured imageSpec for each frame:\n\n${scenesContext}`,
    temperature: 0.8,
  });
  if (!output) throw new Error("Failed to generate frame prompts");

  const scenesOut: FramePromptsOutput["scenes"] = output.scenes.map((scene, si) => {
    const frameSpecs = frameBreakdown.scenes[si]?.frames ?? [];
    const frames: FramePromptRecord[] = scene.frames.map((f, fi) => {
      const frameSpec = frameSpecs[fi];
      if (!frameSpec) {
        throw new Error(`Missing frame breakdown for scene ${si} frame ${fi}`);
      }
      const assembled = assembleSubjectIdentityFromFrame(frameSpec.subjectFocus, continuity.characterRegistry);
      const normalized = normalizeSubjectIdentity(assembled, continuity.characterRegistry);
      const mergedSpec = mergeImageSpecWithUpstreamSubject(f.imageSpec, normalized.subjectPrimary);
      const imagePrompt = serializeFrameImageSpec({
        spec: mergedSpec,
        styleGuide,
        sceneIndex: si,
        frameSpec,
      });
      return {
        imageSpec: mergedSpec,
        imagePrompt,
        assetRefs: f.assetRefs,
        clipDuration: frameSpec.clipDuration,
      };
    });
    return { frames };
  });

  return { scenes: scenesOut };
}
