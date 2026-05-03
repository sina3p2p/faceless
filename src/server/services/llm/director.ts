import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { buildStoryAssetVisionContentParts } from "@/server/services/story-asset-tools";
import { openrouter, type StoryAsset } from "./index";
import type { CreativeBrief, SceneFunction } from "@/types/pipeline";

// ── Director Agent Schemas ──

const sceneFunctionEnum = z.enum([
  "setup",
  "escalate",
  "reveal",
  "reversal",
  "quiet-beat",
  "climax",
  "resolve",
]);

const directorSceneSchema = z.object({
  sceneTitle: z.string().describe("Short descriptive title for this scene (2-5 words), like a chapter heading"),
  text: z.string().describe("The narration text chunk for this scene — extracted from the story prose. This is what the viewer HEARS."),
  sceneFunction: sceneFunctionEnum.describe("The DRAMATIC function this scene serves: 'setup' (establish), 'escalate' (raise stakes), 'reveal' (deliver new info), 'reversal' (overturn expectation), 'quiet-beat' (slow down before a punch), 'climax' (peak), 'resolve' (land the ending). Across the full sequence the functions MUST vary — never two of the same in a row, and the sequence must contain at least one 'quiet-beat' and either a 'reversal' or a 'reveal'."),
  directorNote: z.string().describe("Concrete creative brief for the visual team. Be specific — every detail must be physically renderable. Describe: SETTING (exact location, time period, weather, architecture, materials), SUBJECTS (appearance by consistent name, clothing, posture, expression, age), ACTION (visual progression — 2-3 sequential beats), MOOD (physical elements only — lighting, weather, posture), CAMERA (angle, framing, constrained to the visual style's medium). VISUAL CONTINUITY: maintain consistent subject names and appearance across scenes. Write as if briefing a cinematographer on a film set."),
});

export type DirectorSceneFunction = SceneFunction;

const directorOutputSchema = z.object({
  scenes: z.array(directorSceneSchema),
});

export type DirectorOutput = z.infer<typeof directorOutputSchema>;

// ── Director Agent ──

export async function splitStoryIntoScenes(
  storyMarkdown: string,
  style: string,
  language = "en",
  model?: string,
  videoType?: string,
  brief?: CreativeBrief,
  assets?: StoryAsset[]
): Promise<DirectorOutput> {
  const primaryModel = model || LLM.directorModel;
  const langName = getLanguageName(language);
  const isMusic = videoType === "music_video";

  const assetSys =
    assets && assets.length > 0
      ? `\n\nSTORY ASSETS: Reference images are attached in the user message (when present). For each named asset, match wardrobe, hair, and environment to what you see; use that asset's exact name in directorNote when they appear.`
      : "";

  const briefConstraints = brief ? `
  CREATIVE BRIEF CONSTRAINTS:
  - Max sentences per scene: ${brief.formatConstraints.maxSentencesPerScene}
  - Scene count: ${brief.durationGuidance.sceneBudget.min}–${brief.durationGuidance.sceneBudget.max} scenes
  - Reveal timing: ${brief.formatConstraints.revealTiming === "early" ? "reveal the key information early, then explore consequences" : brief.formatConstraints.revealTiming === "gradual" ? "reveal pieces throughout the narrative" : "build toward a final reveal at the end"}
  - Pacing: ${brief.pacingStrategy}
  - Visual mood: ${brief.visualMood}` : "";

  const musicInstruction = `You are an elite music video director. Given song lyrics organized by sections, create a scene for each section with a detailed visual director's note.

  SCENE SPLITTING RULES:
  - Each scene = ONE song section (Verse, Chorus, Bridge, etc.)
  - The sceneTitle should be the section name (e.g. "Verse 1", "Chorus", "Bridge")
  - The text field is the LYRICS for that section — preserve them exactly as written
  - Do NOT merge or split sections — one scene per section header
  
  DIRECTOR NOTE RULES (CRITICAL — this is what makes the music video look amazing):
  - Be maximally specific and concrete. Every detail you write must be physically visible on screen — if a camera cannot photograph it, do not include it.
  - The visual style is: ${style}. Let this medium inform your creative vision.
  - For each scene, describe the COMPLETE music video visual:
    - SETTING: Location, time of day, environment, set design — use concrete physical details (materials, colors, objects)
    - PERFORMANCE: Who/what is on screen — appearance, costume, choreography, energy level
    - ACTION: Describe a visual PROGRESSION of 2-3 sequential beats that unfold across this section. Each beat must flow naturally into the next as a continuous sequence — no random jumps.
    - MOOD: Express mood through PHYSICAL elements only — lighting color, weather, character posture, environment state. NOT abstract feelings.
  - Think like a director writing shot notes for a premium music video production
  - directorNote MUST be in English (for AI model compatibility)
  
  NAMING CONSISTENCY (CRITICAL):
  - In scene 1, establish a SHORT NAME for every character and key location (e.g. "The Singer", "The Rooftop").
  - Use that EXACT name every time they appear in subsequent scenes. NEVER rename, rephrase, or use synonyms.
  
  CROSS-SCENE CONSISTENCY (CRITICAL):
  - The main performer/subject must have the SAME appearance across ALL scenes — same clothing, same hair, same physical features.
  - If a location recurs, describe it identically each time.
  - Costume changes are allowed ONLY if the lyrics explicitly indicate a transformation or time shift.
  
  RENDERABILITY RULE:
  - ONLY describe things that can be physically photographed or painted: people, objects, places, weather, light.
  - NEVER use abstract concepts as visuals. Translate them into concrete imagery.

  SCENE FUNCTION TAGGING (required field, even for music videos):
  - Verses → 'setup' or 'escalate'. Pre-chorus → 'escalate'. Chorus → 'climax'. Bridge → 'quiet-beat' or 'reversal'. Outro → 'resolve'.
  - Pick the tag that best fits the section's role in the song's arc.
  ${briefConstraints}
  LANGUAGE RULE:
  - sceneTitle and text MUST be in ${langName}
  - directorNote MUST be in English`

  const storyInstruction = `You are an elite film director. Given a complete story, split it into scenes and write a detailed director's note for each.

SCENE SPLITTING RULES:
- Split at natural narrative beats — each scene = ONE clear moment, action, or emotional beat
- NEVER cram multiple actions into one scene
- Each scene's text should be 1-3 sentences from the original story (preserve the original wording as much as possible)
- The text field is what the viewer HEARS as voiceover narration

SCENE FUNCTION (CRITICAL — this is what stops the video from feeling static):
- Tag every scene with a sceneFunction. The sequence of sceneFunctions across the video must VARY.
- Forbidden: two scenes in a row with the same sceneFunction.
- Required across the whole sequence: at least one 'quiet-beat' (a slower, lower-stakes moment placed before a high-stakes scene so the next punch lands), and at least one of 'reversal' or 'reveal'.
- 'setup' and 'escalate' are common — but if you tag every scene 'escalate', the result is a flat, droning video. Use them sparingly.
- The scene function should drive visual choices: 'quiet-beat' = stiller framing, softer light, more negative space; 'reversal' = a visual contradiction (the same place, different); 'climax' = peak motion and tightest framing.

DIRECTOR NOTE RULES (CRITICAL — this is what makes the video look amazing):
- Be maximally specific and concrete. Every detail you write must be physically visible on screen — if a camera cannot photograph it, do not include it.
- The visual style is: ${style}. Let this medium inform your creative vision.
- For each scene, describe the COMPLETE visual world:
  - SETTING: Exact location, time period, time of day, weather, architecture, materials, textures, colors
  - SUBJECTS: Who/what is in the scene — appearance, age, ethnicity, clothing, posture, facial expression, hair, body language
  - ACTION: The single physical moment happening — what is moving, what is still
  - MOOD: Express mood through PHYSICAL elements only — lighting color/quality, weather, character posture, environment state. NOT abstract feelings.
  - VISUAL SYMBOLS: Concrete objects that carry meaning — a wilting flower, a cracked mirror, an empty chair. Every symbol must be a real, photographable thing.
- Think like a director writing shot notes for a $100M film production
- Each directorNote should be self-contained — someone reading it should be able to paint the scene
- directorNote MUST be in English (for AI model compatibility)

NAMING CONSISTENCY (CRITICAL):
- In scene 1, establish a SHORT NAME for every character and key location (e.g. "Old Thomas", "The Workshop").
- Use that EXACT name every time they appear in subsequent scenes. NEVER rename, rephrase, or use synonyms.

CROSS-SCENE CONSISTENCY (CRITICAL):
- The main character must have the SAME appearance across ALL scenes — same clothing, same hair, same physical features.
- If a location recurs, describe it identically each time — same objects, same lighting direction, same color palette.
- Costume or appearance changes are allowed ONLY if the story explicitly describes a transformation, time jump, or disguise.
- Maintain time-of-day continuity within sequential scenes unless the story indicates a time shift.

RENDERABILITY RULE:
- ONLY describe things that can be physically photographed or painted: people, objects, places, weather, light.
- NEVER use abstract concepts as visuals. Translate them into concrete imagery.
${briefConstraints}
LANGUAGE RULE:
- sceneTitle and text MUST be in ${langName}
- directorNote MUST be in English`;

  const userStoryPrompt = `Split this story into scenes and write director's notes:\n\n${storyMarkdown}`;
  const visionParts = assets && assets.length > 0 ? await buildStoryAssetVisionContentParts(assets) : [];

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: directorOutputSchema }),
    system: (isMusic ? musicInstruction : storyInstruction) + assetSys,
    messages: [
      {
        role: "user",
        content: [...visionParts, { type: "text", text: userStoryPrompt }],
      },
    ],
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to split story into scenes");

  return output;
}
