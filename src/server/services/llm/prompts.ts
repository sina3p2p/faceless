/** Machine-checked prompt rules / status: see `prompt-contract.ts` + `image-spec.ts`. */
import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter, buildAssetBlock, type StoryAsset } from "./index";
import type { VisualStyleGuide, FrameBreakdown, ContinuityNotes } from "@/lib/types";
import {
  imageSpecSchema,
  mergeImageSpecWithUpstream,
  serializeFrameImageSpec,
  type ImageSpec,
} from "./image-spec";
import { assembleSubjectIdentityFromFrame, normalizeSubjectIdentity } from "./prompt-contract";

// ── Image Prompt Agent (LLM outputs structured spec; we serialize deterministically) ──

const frameLlmSchema = z.object({
  imageSpec: imageSpecSchema.describe("Visual spec; subject.primary is overwritten from continuity at merge"),
  assetRefs: z.array(z.string()).default([]).describe("Story asset names visible in frame"),
  clipDuration: z.number().describe("Echo storyboard duration only"),
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
  mergeReasonCodes: string[];
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

  const characterCompact =
    continuity.characterRegistry.length > 0
      ? continuity.characterRegistry
          .map((c) => {
            const ref = c.assetRef ? "REF→no appearance in any field" : `look:${[c.appearance.clothing, c.appearance.hair].filter(Boolean).join("; ").slice(0, 100)}`;
            const al = c.aliases.length ? `; aliases forbidden, use "${c.canonicalName}"` : "";
            return `${c.canonicalName}${c.assetRef ? "*" : ""} (${ref})${al}`;
          })
          .join("\n  ")
      : "";

  const perSceneOneLine = styleGuide.perScene
    .map(
      (ps) =>
        `S${ps.sceneIndex}: ${[ps.lightingOverride && `light:${ps.lightingOverride}`, ps.paletteOverride?.join(", "), `mood:${ps.environmentMood}`].filter(Boolean).join(" | ")}`
    )
    .join("\n");

  const systemPrompt = `You output JSON: imageSpec + assetRefs + clipDuration per frame. The server merges continuity, injects cinematographer prefixes, and fixes shot type — do not duplicate that as walls of prose.

LOCKED (server overwrites or injects — do not fight):
- subject.primary → continuity canonical for subjectFocus
- shot type label → storyboard only (you: angle/composition/DOF)
- clipDuration → echo storyboard value per frame
- Prefix strings below are added at serialize — reference only, do not paste long copies

FILL imageSpec:
action | shot.angle/composition/depthOfField | environment.* | lighting.* | style.palette (subset of global/scene) | constraints[] | negativeCues[]
subject.focus: short framing note (no appearance pile if * ref char) | subject.secondary: max 2 labels

Prefixes: SP="${styleGuide.promptRegions.subjectPrefix}" CP="${styleGuide.promptRegions.cameraPrefix}" LP="${styleGuide.promptRegions.lightingPrefix}" BP="${styleGuide.promptRegions.backgroundPrefix}"
Global palette: ${styleGuide.global.colorPalette.join(", ")} | Medium: ${styleGuide.global.medium}

Per-scene:
${perSceneOneLine}
${characterCompact ? `Characters:\n  ${characterCompact}\n* = reference image` : ""}

Intent→energy (one line): introduce|build|climax|react|transition|resolve — match in action field.

Frame counts: ${frameBreakdown.scenes.map((s, i) => `scene ${i}=${s.frames.length}`).join("; ")}
No copyrighted names or logos. ${assets.length > 0 ? "Use exact asset names in assetRefs when visible." : ""}
${buildAssetBlock(assets)}
Return exactly ${scenes.length} scenes.`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: framePromptsLlmOutputSchema }),
    system: systemPrompt,
    prompt: `Create imageSpec for each frame:\n\n${scenesContext}`,
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
      const { spec: mergedSpec, mergeReasonCodes } = mergeImageSpecWithUpstream(f.imageSpec, normalized.subjectPrimary, {
        assetRef: assembled.assetRef,
      });
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
        mergeReasonCodes,
      };
    });
    return { frames };
  });

  return { scenes: scenesOut };
}
