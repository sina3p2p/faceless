import { generateText as aiGenerateText, Output } from "ai";
import { recordAiCall } from "@/server/services/ai-audit";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { buildStoryAssetVisionContentParts } from "@/server/services/story-asset-tools";
import { openrouter, type StoryAsset } from "./index";
import type { CreativeBrief } from "@/types/pipeline";
import { TVideoScene } from "@/types/video";

const characterEntrySchema = z.object({
  canonicalName: z.string().describe("The ONE correct name for this character, used everywhere downstream. Must match storyAssets name if an asset exists."),
  aliases: z.array(z.string()).describe("All OTHER names/references the director used for this character. These are FORBIDDEN downstream."),
  assetRef: z.string().nullable().describe("The exact storyAssets[].name this character maps to, or null if no asset exists"),
  appearance: z.object({
    clothing: z.string().describe("What they wear — locked from scene 1, no changes unless story explicitly transforms them"),
    hair: z.string().describe("Hair style and color — locked"),
    distinguishingFeatures: z.string().describe("Scars, glasses, build, age markers — locked"),
  }),
  firstScene: z.number().describe("Scene index (0-based) where this character first appears"),
  presentInScenes: z.array(z.number()).describe("All scene indices (0-based) where this character is present"),
});

const locationEntrySchema = z.object({
  canonicalName: z.string().describe("The ONE correct name for this location"),
  assetRef: z.string().nullable().describe("The exact storyAssets[].name this location maps to, or null"),
  description: z.string().describe("Physical description of the location"),
  timeOfDay: z.string().describe("Default time of day at this location"),
  lighting: z.string().describe("Default lighting conditions"),
  presentInScenes: z.array(z.number()).describe("All scene indices where this location is used"),
});

const sceneCarryOverSchema = z.object({
  fromScene: z.number(),
  toScene: z.number(),
  carriedElements: z.array(z.string()).describe("Elements that persist: 'Tommy's red backpack', 'rain', 'broken window'"),
  changedElements: z.array(z.string()).describe("Elements that change: 'daylight -> dusk', 'calm -> panicked'"),
});

const sceneFunctionEnum = z.enum([
  "setup",
  "escalate",
  "reveal",
  "reversal",
  "quiet-beat",
  "climax",
  "resolve",
]);

const correctedSceneSchema = z.object({
  sceneTitle: z.string(),
  text: z.string().describe("The corrected narration text — names fixed, pacing adjusted"),
  sceneFunction: sceneFunctionEnum.describe("Dramatic function of this scene. Preserve the director's tag if it exists ([Scene function: X] in the input directorNote). If a scene reveals nothing new and is not a quiet-beat, either flag it via surpriseInjection or re-tag it after restructuring."),
  directorNote: z.string().describe("The corrected director note — names fixed, appearance locked to registry. DO NOT include the [Scene function: ...] tag here; the sceneFunction field carries that. Lighting and color palette MAY shift between scenes to reflect emotional state, even when wardrobe/hair/features are locked."),
  surpriseInjection: z.string().nullable().describe("If this scene reveals nothing new (no fresh fact, image, turn, or tonal shift) AND is not intentionally tagged 'quiet-beat', describe in one sentence what concrete element to inject — a small revelation, a contradicting detail, a sensory turn. Otherwise null."),
});

const supervisorOutputSchema = z.object({
  scenes: z.array(correctedSceneSchema),
  continuityNotes: z.object({
    characterRegistry: z.array(characterEntrySchema),
    locationRegistry: z.array(locationEntrySchema),
    sceneCarryOver: z.array(sceneCarryOverSchema),
  }),
});

export type SupervisorOutput = z.infer<typeof supervisorOutputSchema>;

export interface SceneInput {
  sceneTitle: string;
  text: string;
  directorNote: string;
}

export async function superviseScript(
  scenes: TVideoScene[],
  brief: CreativeBrief,
  storyAssets: StoryAsset[],
  model?: string
): Promise<SupervisorOutput> {
  const primaryModel = model || LLM.supervisorModel;

  const scenesContext = scenes.map((s, i) =>
    `Scene ${i} — "${s.sceneTitle}":\n  Narration: "${s.text}"\n  Director's Note: ${s.directorNote}`
  ).join("\n\n");

  const assetList = storyAssets.length > 0
    ? `\nSTORY ASSETS (these names are the CANONICAL source of truth):\n${storyAssets.map((a) => `  - ${a.name} (${a.type}): ${a.description}`).join("\n")}`
    : "\nNo story assets provided.";

  const wordCount = scenes.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const estimatedDuration = Math.round(wordCount / 2.5);

  const systemPrompt = `You are a Script Supervisor with FULL REWRITE AUTHORITY. You are not a passive reviewer — you are an enforcer.

Your job:
1. ENFORCE naming consistency — every character and location must use ONE canonical name everywhere
2. ENFORCE asset matching — if a storyAsset exists, the canonical name MUST match storyAssets[].name exactly
3. LOCK appearance — extract each character's appearance from their first scene and ensure it never contradicts in later scenes
4. ENFORCE duration — current word count is ${wordCount} words (~${estimatedDuration}s). Target range: ${brief.durationGuidance.wordBudgetMin}–${brief.durationGuidance.wordBudgetMax} words (target: ${brief.durationGuidance.wordBudgetTarget})
5. RESTRUCTURE weak scenes — merge scenes that are too thin, split scenes that are overloaded
6. COMPUTE carry-over — for each scene transition, list what persists and what changes

REWRITE RULES:
- If a character is called "the old man" in scene 0 but "Thomas" in scene 2, and there's an asset named "Thomas", then:
  - canonicalName = "Thomas"
  - aliases = ["the old man"]
  - Rewrite ALL scene text and directorNotes to use "Thomas" instead of "the old man"
- If no asset exists, pick the most specific name used and make it canonical
- Never introduce new characters or plot points — only fix consistency and pacing
- Scene count must be within ${brief.durationGuidance.sceneBudget.min}–${brief.durationGuidance.sceneBudget.max}

DURATION ENFORCEMENT:
- If word count is BELOW ${brief.durationGuidance.wordBudgetMin}: expand thin scenes with more descriptive narration
- If word count is ABOVE ${brief.durationGuidance.wordBudgetMax}: trim verbose scenes, cut redundant sentences
- If within range: leave narration length as-is

APPEARANCE LOCK (what to lock vs. what to let breathe):
- LOCKED across all scenes: clothing, hair, distinguishing features. If scene 3 says "now wearing a blue jacket" but scene 0 said "red coat", fix scene 3 — UNLESS the story explicitly describes a costume change.
- INTENTIONALLY NOT LOCKED: lighting, color palette, weather, time-of-day mood. These SHOULD shift between scenes to reflect emotional state — that's how cinema conveys change without redressing the character. Do not "correct" lighting or palette differences; treat them as deliberate.
- The cinematographer downstream will use those mood shifts. Your job is to preserve them, not flatten them.

SURPRISE / DYNAMICS CHECK (this is what stops the video from feeling static):
- For every scene, ask: "What does the viewer learn, feel, or see for the first time here?"
- A scene that reveals NOTHING new (no fresh fact, no new image, no tonal shift, no turn) is dead weight UNLESS it is intentionally a 'quiet-beat' before a high-stakes scene.
- For each dead-weight scene, populate surpriseInjection with a concrete one-sentence note for the visual team — a small revelation, a contradicting detail, a sensory turn — that the downstream prompt architect can render. Do NOT invent new plot; pull from what is implied or under-shown.
- The sequence of sceneFunctions across scenes must VARY. Forbidden: two scenes in a row sharing the same sceneFunction. If you find a violation, either restructure (merge / split / re-tag) or note it via surpriseInjection.
${assetList}

FORMAT CONSTRAINTS FROM BRIEF:
- Max sentences per scene: ${brief.formatConstraints.maxSentencesPerScene}
- Narration style: ${brief.formatConstraints.narrationStyle}
${storyAssets.length > 0 ? `\nREFERENCE IMAGES: When the user message includes story asset images, use them as ground truth for appearance locking and registry entries; resolve contradictions between scene text and the visuals in favor of the visuals for named assets.` : ""}`;

  const reviewPrompt = `Review and correct these ${scenes.length} scenes:\n\n${scenesContext}`;
  const visionParts = await buildStoryAssetVisionContentParts(storyAssets);

  const { output } = await recordAiCall(
    {
      provider: "openrouter",
      model: primaryModel,
      operation: "llm.superviseScript",
      request: { system: systemPrompt, reviewPrompt, visionParts, temperature: 0.4, schema: "supervisorOutputSchema" },
    },
    () =>
      aiGenerateText({
        model: openrouter.chat(primaryModel),
        output: Output.object({ schema: supervisorOutputSchema }),
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [...visionParts, { type: "text", text: reviewPrompt }],
          },
        ],
        temperature: 0.4,
      }),
  );
  if (!output) throw new Error("Failed to supervise script");

  return output;
}
