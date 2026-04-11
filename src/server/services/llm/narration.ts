import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, type ChatMessage } from "./index";

// ── Video Script Schema (legacy) ──

const videoSceneSchema = z.object({
  text: z.string().describe("Narration text for this scene. Write as much as the story needs — rich, vivid, conversational. No word limit."),
  visualDescription: z.string().describe("Rich detailed description of visual action on screen — movements, gestures, camera motion, environment changes. Must describe MOTION and ACTION, not a static image. Must also describe how the scene ENDS (motion settling, camera resting) for smooth transition to the next scene."),
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT (appearance, clothing, expression), ACTION/MOTION, ENVIRONMENT, LIGHTING, CAMERA angle/movement, MOOD/ATMOSPHERE, and STYLE. Single detailed paragraph."),
  assetRefs: z.array(z.string()).default([]).describe("Array of asset names from the STORY ASSETS list that appear in this scene. Include characters who are visible, the location where the scene takes place, and any props that are shown. If no story assets were provided, return an empty array."),
  duration: z.number().describe("Duration of this scene in seconds"),
});

const videoScriptSchema = z.object({
  title: z.string().describe("SEO-optimized title with emotional trigger words"),
  hook: z.string().describe("Opening 1-2 sentences that create instant curiosity gap (spoken in first 3 seconds)"),
  scenes: z.array(videoSceneSchema),
  cta: z.string().describe("Call to action that makes viewers comment, like, or follow"),
  totalDuration: z.number().describe("Total video duration in seconds"),
});

export type VideoScript = z.infer<typeof videoScriptSchema>;

// ── Narration-Only Schemas ──

const narrationSceneSchema = z.object({
  sceneTitle: z.string().describe("Short descriptive title for this scene (2-5 words), like a chapter heading. E.g. 'The Birth of a Giant', 'Into the Abyss', 'The Final Goodbye'"),
  text: z.string().describe("Narration text for this scene. Write as much as the story needs — rich, vivid, conversational. No word limit."),
  directorNote: z.string().describe("RICH creative brief for the visual team (NO word limit — be as detailed as possible). Describe: the SETTING (exact location, time period, weather, time of day, architecture, materials), the SUBJECTS (who/what is in the scene — appearance, clothing, posture, facial expression, age, ethnicity), the ACTION (what is physically happening in this one moment), the MOOD/ATMOSPHERE (emotional tone, tension level, color palette, lighting quality), the CAMERA PERSPECTIVE (where the viewer is watching from, what feels close vs far), and any SYMBOLIC or FORESHADOWING elements. Write as if you are a film director giving a brief to your cinematographer and production designer. The more detail you provide, the better the final video will look."),
  duration: z.number().describe("Duration of this scene in seconds"),
});

const narrationScriptSchema = z.object({
  title: z.string().describe("SEO-optimized title with emotional trigger words"),
  hook: z.string().describe("Opening 1-2 sentences that create instant curiosity gap (spoken in first 3 seconds)"),
  scenes: z.array(narrationSceneSchema),
  cta: z.string().describe("Call to action that makes viewers comment, like, or follow"),
  totalDuration: z.number().describe("Total video duration in seconds"),
});

export type NarrationScript = z.infer<typeof narrationScriptSchema>;

const narrationDialogueSceneSchema = z.object({
  sceneTitle: z.string().describe("Short descriptive title for this scene (2-5 words), like a chapter heading"),
  speaker: z.string().describe("Who is speaking: exact character name or 'Narrator'"),
  text: z.string().describe("What this character says, or narrator description"),
  directorNote: z.string().describe("RICH creative brief for the visual team (NO word limit). Describe the setting, the speaking character's body language/expression/gestures, the mood, the lighting, the camera angle (over-the-shoulder, close-up, wide two-shot), and how this moment FEELS emotionally. Write as if briefing a cinematographer."),
  duration: z.number().describe("Duration of this scene in seconds"),
});

const narrationDialogueScriptSchema = z.object({
  title: z.string().describe("Title for this dialogue video"),
  hook: z.string().describe("Brief hook or setup for the conversation"),
  scenes: z.array(narrationDialogueSceneSchema),
  cta: z.string().describe("Call to action at the end"),
  totalDuration: z.number().describe("Total video duration in seconds"),
});

export type NarrationDialogueScript = z.infer<typeof narrationDialogueScriptSchema>;

// ── Image Agent Output Schema (legacy) ──

const imagePromptOutputSceneSchema = z.object({
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT (appearance, clothing, expression), ACTION/MOTION, ENVIRONMENT, LIGHTING, CAMERA angle/movement, MOOD/ATMOSPHERE, and STYLE. Single detailed paragraph."),
  assetRefs: z.array(z.string()).default([]).describe("Array of asset names from the STORY ASSETS list that appear in this scene. Include characters who are visible, the location where the scene takes place, and any props that are shown. If no story assets were provided, return an empty array."),
});

const imagePromptOutputSchema = z.object({
  scenes: z.array(imagePromptOutputSceneSchema),
});

export type ImagePromptOutput = z.infer<typeof imagePromptOutputSchema>;

// ── Motion Agent Output Schema (legacy) ──

const motionOutputSceneSchema = z.object({
  visualDescription: z.string().describe("Rich detailed description of visual action on screen (30-60 words) — camera motion, subject motion, environment motion. Must describe CONTINUOUS MOTION, not a static image. Must also describe how the scene ENDS for smooth transition to the next scene."),
});

const motionOutputSchema = z.object({
  scenes: z.array(motionOutputSceneSchema),
});

export type MotionOutput = z.infer<typeof motionOutputSchema>;

// ── Narration Script Refinement ──

export async function refineNarrationScript(
  currentScript: NarrationScript,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: string,
  language = "en"
): Promise<NarrationScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative video script editor. The user has a narration script with director's notes and wants to improve it through conversation.

CURRENT SCRIPT:
${JSON.stringify(currentScript, null, 2)}

RULES:
- Apply the user's requested changes to the script and return the COMPLETE modified script
- Only change what the user asks for — preserve everything else exactly as-is
- If the user asks to change a specific scene, only modify that scene
- If the user asks for tone/style changes, apply them across all scenes (including directorNotes)
- Maintain the same JSON structure
- If the user's request is vague, make your best creative judgment
- You can add, remove, reorder, or merge scenes if the user asks
- ONE ACTION PER SCENE: Each scene must show exactly ONE clear action.
- When adding new scenes, always include sceneTitle and a detailed directorNote
- When modifying a scene's narration, update the directorNote to match if the visual intent changed
- directorNote should always be in English. sceneTitle and text follow the language rule below.

LANGUAGE RULE (CRITICAL):
- The user may write their instructions in ANY language, but the script output (title, hook, narration text, CTA, sceneTitle) MUST ALWAYS be written in ${langName}.
- directorNote MUST be in English (for AI model compatibility).
- Never switch the script language based on the user's input language.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: userMessage });

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: narrationScriptSchema }),
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to refine narration script");

  return output;
}
