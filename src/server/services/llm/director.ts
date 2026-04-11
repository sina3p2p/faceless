import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter } from "./index";

// ── Director Agent Schemas ──

const directorSceneSchema = z.object({
  sceneTitle: z.string().describe("Short descriptive title for this scene (2-5 words), like a chapter heading"),
  text: z.string().describe("The narration text chunk for this scene — extracted from the story prose. This is what the viewer HEARS."),
  directorNote: z.string().describe("Concrete creative brief for the visual team. Be specific — every detail must be physically renderable. Describe: SETTING (exact location, time period, weather, architecture, materials), SUBJECTS (appearance by consistent name, clothing, posture, expression, age), ACTION (visual progression — 2-3 sequential beats), MOOD (physical elements only — lighting, weather, posture), CAMERA (angle, framing, constrained to the visual style's medium). VISUAL CONTINUITY: maintain consistent subject names and appearance across scenes. Write as if briefing a cinematographer on a film set."),
});

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
  videoType?: string
): Promise<DirectorOutput> {
  const primaryModel = model || LLM.directorModel;
  const langName = getLanguageName(language);
  const isMusic = videoType === "music_video";

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
    - ACTION: Describe a visual PROGRESSION of 2-3 sequential beats that unfold across this section (e.g. "starts walking down the corridor → pushes through the door → steps into bright daylight"). Each beat must flow naturally into the next as a continuous sequence — no random jumps. This gives the frame generator enough variety to fill multiple frames.
    - MOOD: Express mood through PHYSICAL elements only — lighting color, weather, character posture, environment state. NOT abstract feelings.
    - CAMERA: Suggest camera work appropriate to the visual style's medium (see STYLE-AWARE CAMERA below)
  - Think like a director writing shot notes for a premium music video production
  - directorNote MUST be in English (for AI model compatibility)
  
  NAMING CONSISTENCY (CRITICAL):
  - In scene 1, establish a SHORT NAME for every character and key location (e.g. "The Singer", "The Rooftop").
  - Use that EXACT name every time they appear in subsequent scenes. NEVER rename, rephrase, or use synonyms — "The Singer" must stay "The Singer", not "the performer", "the artist", or "she".
  - This is essential because the next stage in the pipeline matches characters by name.
  
  CROSS-SCENE CONSISTENCY (CRITICAL):
  - The main performer/subject must have the SAME appearance across ALL scenes — same clothing, same hair, same physical features. Establish their look in scene 1 and maintain it.
  - If a location recurs (e.g. chorus returns to a stage), describe it identically each time.
  - Costume changes are allowed ONLY if the lyrics explicitly indicate a transformation or time shift.
  
  RENDERABILITY RULE:
  - ONLY describe things that can be physically photographed or painted: people, objects, places, weather, light.
  - NEVER use abstract concepts as visuals: "floating memories", "emotional energy", "symbolic freedom", "essence of loss". Instead, translate them into concrete imagery: "old photographs scattered on a table", "a clenched fist relaxing", "an open birdcage with the door swinging".
  
  STYLE-AWARE CAMERA:
  - Your camera suggestions MUST respect the physical constraints of the visual style (${style}).
  - For stop-motion / claymation / lego: use static tripod shots, slow pans, fixed angles. NO drone shots, NO handheld shake, NO rack focus, NO fast tracking. These are miniature sets filmed frame-by-frame.
  - For realistic / cinematic: full range of camera work is available — dolly, crane, handheld, drone, rack focus.
  - For illustration / anime / comic: use compositional framing (rule of thirds, diagonal lines) rather than physical camera moves. Describe the "virtual camera" angle and distance.
  - When unsure, default to static, deliberate camera work that suits the medium.
  
  LANGUAGE RULE:
  - sceneTitle and text MUST be in ${langName}
  - directorNote MUST be in English`

  const storyInstruction = `You are an elite film director. Given a complete story, split it into scenes and write a detailed director's note for each.

SCENE SPLITTING RULES:
- Split at natural narrative beats — each scene = ONE clear moment, action, or emotional beat
- NEVER cram multiple actions into one scene
- Each scene's text should be 1-3 sentences from the original story (preserve the original wording as much as possible)
- The text field is what the viewer HEARS as voiceover narration

DIRECTOR NOTE RULES (CRITICAL — this is what makes the video look amazing):
- Be maximally specific and concrete. Every detail you write must be physically visible on screen — if a camera cannot photograph it, do not include it.
- The visual style is: ${style}. Let this medium inform your creative vision.
- For each scene, describe the COMPLETE visual world:
  - SETTING: Exact location, time period, time of day, weather, architecture, materials, textures, colors
  - SUBJECTS: Who/what is in the scene — appearance, age, ethnicity, clothing, posture, facial expression, hair, body language
  - ACTION: The single physical moment happening — what is moving, what is still
  - MOOD: Express mood through PHYSICAL elements only — lighting color/quality (golden hour, harsh fluorescent, candlelight, moonlit), weather, character posture, environment state. NOT abstract feelings.
  - CAMERA: Where the viewer watches from — low angle (power), bird's eye (scale), close-up (intimacy), wide establishing (context). Must respect the visual style's medium (see STYLE-AWARE CAMERA below).
  - VISUAL SYMBOLS: Concrete objects that carry meaning — a wilting flower, a cracked mirror, an empty chair. Every symbol must be a real, photographable thing.
- Think like a director writing shot notes for a $100M film production
- Each directorNote should be self-contained — someone reading it should be able to paint the scene
- directorNote MUST be in English (for AI model compatibility)

NAMING CONSISTENCY (CRITICAL):
- In scene 1, establish a SHORT NAME for every character and key location (e.g. "Old Thomas", "The Workshop").
- Use that EXACT name every time they appear in subsequent scenes. NEVER rename, rephrase, or use synonyms — "Old Thomas" must stay "Old Thomas", not "the man", "the elder", or "Thomas".
- This is essential because the next stage in the pipeline matches characters by name.

CROSS-SCENE CONSISTENCY (CRITICAL):
- The main character must have the SAME appearance across ALL scenes — same clothing, same hair, same physical features. Establish their look in scene 1 and maintain it.
- If a location recurs, describe it identically each time — same objects, same lighting direction, same color palette.
- Costume or appearance changes are allowed ONLY if the story explicitly describes a transformation, time jump, or disguise.
- Maintain time-of-day continuity within sequential scenes unless the story indicates a time shift.

RENDERABILITY RULE:
- ONLY describe things that can be physically photographed or painted: people, objects, places, weather, light.
- NEVER use abstract concepts as visuals: "floating memories", "emotional energy", "symbolic freedom", "essence of loss". Instead, translate them into concrete imagery: "old photographs scattered on a table", "a clenched fist relaxing", "an open birdcage with the door swinging".

STYLE-AWARE CAMERA:
- Your camera suggestions MUST respect the physical constraints of the visual style (${style}).
- For stop-motion / claymation / lego: use static tripod shots, slow pans, fixed angles. NO drone shots, NO handheld shake, NO rack focus, NO fast tracking. These are miniature sets filmed frame-by-frame.
- For realistic / cinematic: full range of camera work is available — dolly, crane, handheld, drone, rack focus.
- For illustration / anime / comic: use compositional framing (rule of thirds, diagonal lines) rather than physical camera moves. Describe the "virtual camera" angle and distance.
- When unsure, default to static, deliberate camera work that suits the medium.

LANGUAGE RULE:
- sceneTitle and text MUST be in ${langName}
- directorNote MUST be in English`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: directorOutputSchema }),
    system: isMusic ? musicInstruction : storyInstruction,
    prompt: `Split this story into scenes and write director's notes:\n\n${storyMarkdown}`,
    temperature: 0.7,
  });
  if (!output) throw new Error("Failed to split story into scenes");

  return output;
}
