import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter, type StoryAsset } from "./index";
import type { CreativeBrief, ContinuityNotes } from "@/lib/types";

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

const correctedSceneSchema = z.object({
  sceneTitle: z.string(),
  text: z.string().describe("The corrected narration text — names fixed, pacing adjusted"),
  directorNote: z.string().describe("The corrected director note — names fixed, appearance locked to registry"),
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
  scenes: SceneInput[],
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

APPEARANCE LOCK:
- In scene 0's directorNote, find each character's clothing, hair, and distinguishing features
- Lock those values — if scene 3 says "now wearing a blue jacket" but scene 0 said "red coat", fix scene 3 to say "red coat" UNLESS the story explicitly describes a costume change
${assetList}

FORMAT CONSTRAINTS FROM BRIEF:
- Max sentences per scene: ${brief.formatConstraints.maxSentencesPerScene}
- Narration style: ${brief.formatConstraints.narrationStyle}`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: supervisorOutputSchema }),
    system: systemPrompt,
    prompt: `Review and correct these ${scenes.length} scenes:\n\n${scenesContext}`,
    temperature: 0.4,
  });
  if (!output) throw new Error("Failed to supervise script");

  return output;
}
