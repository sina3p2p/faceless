import { z } from "zod";

const videoSceneSchema = z.object({
  text: z.string().describe("Narration text for this scene. Write as much as the story needs — rich, vivid, conversational. No word limit."),
  visualDescription: z.string().describe("Rich detailed description of visual action on screen — movements, gestures, camera motion, environment changes. Must describe MOTION and ACTION, not a static image. Must also describe how the scene ENDS (motion settling, camera resting) for smooth transition to the next scene."),
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT (appearance, clothing, expression), ACTION/MOTION, ENVIRONMENT, LIGHTING, CAMERA angle/movement, MOOD/ATMOSPHERE, and STYLE. Single detailed paragraph."),
  assetRefs: z.array(z.string()).default([]).describe("Array of asset names from the STORY ASSETS list that appear in this scene. Include characters who are visible, the location where the scene takes place, and any props that are shown. If no story assets were provided, return an empty array."),
  duration: z.number().describe("Duration of this scene in seconds"),
});

export const videoScriptSchema = z.object({
  title: z.string().describe("SEO-optimized title with emotional trigger words"),
  hook: z.string().describe("Opening 1-2 sentences that create instant curiosity gap (spoken in first 3 seconds)"),
  scenes: z.array(videoSceneSchema),
  cta: z.string().describe("Call to action that makes viewers comment, like, or follow"),
  totalDuration: z.number().describe("Total video duration in seconds"),
});

export type VideoScript = z.infer<typeof videoScriptSchema>;

const narrationSceneSchema = z.object({
  sceneTitle: z.string().describe("Short descriptive title for this scene (2-5 words), like a chapter heading. E.g. 'The Birth of a Giant', 'Into the Abyss', 'The Final Goodbye'"),
  text: z.string().describe("Narration text for this scene. Write as much as the story needs — rich, vivid, conversational. No word limit."),
  directorNote: z.string().describe("RICH creative brief for the visual team (NO word limit — be as detailed as possible). Describe: the SETTING (exact location, time period, weather, time of day, architecture, materials), the SUBJECTS (who/what is in the scene — appearance, clothing, posture, facial expression, age, ethnicity), the ACTION (what is physically happening in this one moment), the MOOD/ATMOSPHERE (emotional tone, tension level, color palette, lighting quality), the CAMERA PERSPECTIVE (where the viewer is watching from, what feels close vs far), and any SYMBOLIC or FORESHADOWING elements. Write as if you are a film director giving a brief to your cinematographer and production designer. The more detail you provide, the better the final video will look."),
  duration: z.number().describe("Duration of this scene in seconds"),
});

export const narrationScriptSchema = z.object({
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

export const narrationDialogueScriptSchema = z.object({
  title: z.string().describe("Title for this dialogue video"),
  hook: z.string().describe("Brief hook or setup for the conversation"),
  scenes: z.array(narrationDialogueSceneSchema),
  cta: z.string().describe("Call to action at the end"),
  totalDuration: z.number().describe("Total video duration in seconds"),
});

export type NarrationDialogueScript = z.infer<typeof narrationDialogueScriptSchema>;

const imagePromptOutputSceneSchema = z.object({
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT (appearance, clothing, expression), ACTION/MOTION, ENVIRONMENT, LIGHTING, CAMERA angle/movement, MOOD/ATMOSPHERE, and STYLE. Single detailed paragraph."),
  assetRefs: z.array(z.string()).default([]).describe("Array of asset names from the STORY ASSETS list that appear in this scene. Include characters who are visible, the location where the scene takes place, and any props that are shown. If no story assets were provided, return an empty array."),
});

export const imagePromptOutputSchema = z.object({
  scenes: z.array(imagePromptOutputSceneSchema),
});

export type ImagePromptOutput = z.infer<typeof imagePromptOutputSchema>;

const motionOutputSceneSchema = z.object({
  visualDescription: z.string().describe("Rich detailed description of visual action on screen (30-60 words) — camera motion, subject motion, environment motion. Must describe CONTINUOUS MOTION, not a static image. Must also describe how the scene ENDS for smooth transition to the next scene."),
});

export const motionOutputSchema = z.object({
  scenes: z.array(motionOutputSceneSchema),
});

export type MotionOutput = z.infer<typeof motionOutputSchema>;
