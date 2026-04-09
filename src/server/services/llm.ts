import { generateObject, generateText as aiGenerateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";

export const openrouter = createOpenRouter({
  apiKey: LLM.apiKey,
});

// ── Zod Schemas ──

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

const musicSectionSchema = z.object({
  sectionName: z.string().describe("Section type, e.g. 'Intro', 'Verse 1', 'Chorus', 'Bridge', 'Outro'"),
  lyrics: z.array(z.string()).describe("Song lyrics for this section, one line per array element"),
  durationMs: z.number().describe("Section duration in milliseconds (5000-30000)"),
  imagePrompt: z.string().describe("Extremely detailed visual prompt for the key frame image of this section's video clip — be as descriptive as possible"),
  visualDescription: z.string().describe("Detailed motion/action description for the AI video model — camera motion, subject motion, environmental animation"),
  positiveStyles: z.array(z.string()).describe("Musical elements to include, e.g. 'electric guitar', 'driving drums', 'female vocals'"),
  negativeStyles: z.array(z.string()).describe("Musical elements to avoid, e.g. 'saxophone', 'country twang'"),
});

const musicScriptSchema = z.object({
  title: z.string().describe("Catchy song title"),
  genre: z.string().describe("Music genre/style for the AI music generator, e.g. 'pop, upbeat, catchy'"),
  totalDuration: z.number().describe("Total song duration in seconds"),
  sections: z.array(musicSectionSchema),
});

export type MusicSection = z.infer<typeof musicSectionSchema>;
export type MusicScript = z.infer<typeof musicScriptSchema>;

// Phase 1: lyrics only (no visual fields)
const musicLyricsSectionSchema = z.object({
  sectionName: z.string().describe("Section type, e.g. 'Intro', 'Verse 1', 'Chorus', 'Bridge', 'Outro'"),
  lyrics: z.array(z.string()).describe("Song lyrics for this section, one line per array element"),
  durationMs: z.number().describe("Estimated section duration in milliseconds — will be replaced by actual timestamps after song generation"),
  positiveStyles: z.array(z.string()).describe("Musical elements to include, e.g. 'electric guitar', 'driving drums', 'female vocals'"),
  negativeStyles: z.array(z.string()).describe("Musical elements to avoid, e.g. 'saxophone', 'country twang'"),
});

const musicLyricsSchema = z.object({
  title: z.string().describe("Catchy song title"),
  genre: z.string().describe("Music genre/style for the AI music generator, e.g. 'pop, upbeat, catchy'"),
  sections: z.array(musicLyricsSectionSchema),
});

export type MusicLyrics = z.infer<typeof musicLyricsSchema>;

// Phase 2: visuals only (receives actual timestamps)
const musicVisualSectionSchema = z.object({
  imagePrompt: z.string().describe("Extremely detailed visual prompt for the key frame image of this section's video clip"),
  visualDescription: z.string().describe("Detailed motion/action description for the AI video model — camera motion, subject motion, environmental animation"),
});

const musicVisualSchema = z.object({
  sections: z.array(musicVisualSectionSchema),
});

export type MusicVisuals = z.infer<typeof musicVisualSchema>;

// ── Script Refinement (chat-based) ──

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function refineMusicScript(
  currentScript: MusicScript,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: string,
  language = "en"
): Promise<MusicScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative music video script editor. The user has a music script and wants to improve it through conversation.

CURRENT SCRIPT:
${JSON.stringify(currentScript, null, 2)}

RULES:
- Apply the user's requested changes to the script and return the COMPLETE modified script
- Only change what the user asks for — preserve everything else exactly as-is
- If the user asks to change a specific section, only modify that section
- If the user asks for tone/style/genre changes, apply them appropriately
- Keep all imagePrompts and visualDescriptions as detailed as possible
- Maintain the same JSON structure
- Lyrics must remain singable — short lines, good rhythm
- If the user's request is vague, make your best creative judgment
- ONE ACTION PER SECTION: Each section's visuals must show exactly ONE clear action. If lyrics pack multiple actions, pick the single most impactful moment for the imagePrompt/visualDescription. Split into more sections if needed.

LANGUAGE RULE (CRITICAL):
- The user may write their instructions in ANY language, but the script output (title, lyrics, sectionName) MUST ALWAYS be written in ${langName}.
- imagePrompt, visualDescription, and genre should remain in English for best AI model compatibility.
- Never switch the script language based on the user's input language. Always output lyrics and titles in ${langName}.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: "user", content: userMessage });

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicScriptSchema,
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });

  return object;
}

// ── Generic text generation (for non-structured calls) ──

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options: { maxOutputTokens?: number; temperature?: number; model?: string } = {}
): Promise<string> {
  const { maxOutputTokens, temperature = 0.7, model } = options;
  const primaryModel = model || LLM.defaultModel;

  const { text } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    system: systemPrompt,
    prompt: userPrompt,
    temperature,
    ...(maxOutputTokens && { maxOutputTokens }),
  });

  return text;
}

// ── Duration Instruction Helpers ──

function buildDurationInstruction(targetDuration: number, durations?: number[]): string {
  if (!durations || durations.length === 0) {
    return `- Total duration should be ${targetDuration} seconds\n- Aim for 5-7 scenes`;
  }
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const isFlexible = durations.length > 2;
  if (isFlexible) {
    return [
      `- Total duration should be ${targetDuration} seconds`,
      `- Each scene duration MUST be a whole number between ${min} and ${max} seconds (inclusive)`,
      `- You decide how many scenes to create — split the total time into scenes that each fit within ${min}-${max}s`,
      `- Vary scene durations naturally: quick cuts (${min}-${min + 2}s) for action, longer holds (${max - 3}-${max}s) for emotional beats`,
    ].join("\n");
  }
  const allowed = durations.join(" or ");
  return [
    `- Total duration should be ${targetDuration} seconds`,
    `- Each scene duration MUST be exactly ${allowed} seconds — no other values`,
    `- You decide how many scenes to create to fill the total duration using only ${allowed}s scenes`,
  ].join("\n");
}

function buildMusicDurationInstruction(targetDuration: number, durations?: number[]): string {
  if (!durations || durations.length === 0) {
    if (targetDuration <= 30) return "Aim for 3-4 SHORT sections only (e.g. Intro + Verse + Chorus + Outro). Keep each section to 2-4 lines of lyrics MAX. Fewer sections = shorter song.";
    if (targetDuration <= 45) return "Aim for 4-5 sections (e.g. Intro + Verse + Chorus + Verse + Outro). Keep lyrics concise — 2-4 lines per section.";
    return "Aim for 5-7 sections: Intro + 2 Verses + 2 Choruses + Bridge/Outro.";
  }
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const isFlexible = durations.length > 2;
  if (isFlexible) {
    return [
      `Each section's durationMs must produce a whole number of seconds between ${min} and ${max} (e.g. ${min * 1000}-${max * 1000}ms).`,
      `You decide how many sections to create — split the ~${targetDuration}s total into sections that each fit within ${min}-${max}s.`,
      `Vary section lengths: short bursts (${min}-${min + 2}s) for intros/outros, longer holds (${max - 3}-${max}s) for verses/choruses.`,
    ].join(" ");
  }
  const allowed = durations.join(" or ");
  return `Each section's durationMs MUST produce exactly ${allowed} seconds (i.e. ${durations.map(d => d * 1000).join(" or ")}ms). You decide how many sections to create to fill ~${targetDuration}s using only ${allowed}s sections.`;
}

// ── Music Script Generation ──

export async function generateMusicScript(
  niche: string,
  style: string,
  topicIdea?: string,
  targetDuration = 60,
  model?: string,
  previousTopics: string[] = [],
  language = "en",
  durations?: number[]
): Promise<MusicScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite songwriter AND music video director. You create songs that go viral on TikTok and YouTube Shorts, and pair them with cinematic visuals that are PERFECTLY synchronized with the music.

OUTPUT LANGUAGE (CRITICAL — do NOT ignore):
- ALL lyrics, song title, and sectionName MUST be written in ${langName}.
- imagePrompt, visualDescription, genre, positiveStyles, and negativeStyles MUST remain in English for best AI model compatibility.
- This rule overrides everything else. Even if the niche or topic is in another language, lyrics and titles must be in ${langName}.

SONGWRITING RULES:
1. Write lyrics that are CATCHY, MEMORABLE, and SINGABLE. Use rhyme, repetition, and strong hooks.
2. The chorus should be the most memorable part — repeat it 2-3 times.
3. Keep lyrics SHORT per line (5-10 words). Each line must be at most 200 characters.
4. Match the genre to the niche: ${niche}
5. Total song duration MUST be approximately ${targetDuration} seconds. This is CRITICAL for cost control.
6. ${buildMusicDurationInstruction(targetDuration, durations)}
7. positiveStyles should describe instruments, tempo, and vocal characteristics that match the genre.
8. negativeStyles should list elements that would clash with the desired sound.

VISUAL-MUSIC SYNC RULES (CRITICAL — this is what makes or breaks the video):

The visuals must feel like they were CHOREOGRAPHED to the music. Think like a real music video director.

1. MATCH ENERGY TO SECTION TYPE:
   - Intro: Establishing shot, slow reveal, atmospheric. Camera slowly pushing in or pulling back. Mysterious, anticipation-building.
   - Verse: Storytelling scenes, medium shots of the subject, narrative progression. Moderate pace camera moves. The visual should ILLUSTRATE what the lyrics describe.
   - Pre-Chorus: Building tension — camera gets closer, lighting intensifies, motion speeds up slightly.
   - Chorus: MAXIMUM energy. Wide dynamic shots, dramatic lighting shifts, fast camera moves, vibrant colors. The visual peak must match the musical peak.
   - Bridge: Contrast — something different. A new location, perspective shift, emotional turning point. Often slower, more intimate.
   - Outro: Resolution. Wide pullback shot, sunset/sunrise, the subject walking away, fading light. Closure.

2. LYRIC-VISUAL LITERALISM:
   - If lyrics mention "fire" → show flames, warm orange lighting, glowing embers
   - If lyrics mention "rain" → wet surfaces, water droplets, gray moody sky
   - If lyrics mention "night" → dark setting, moonlight, city lights, neon glow
   - If lyrics mention "flying/soaring" → aerial perspective, clouds, birds, open sky
   - EVERY section's visuals must directly reference the lyrics being sung in that section. Do NOT generate generic pretty scenes.

3. imagePrompt DETAIL REQUIREMENTS (be as detailed as possible, no word limit):
   - SUBJECT: Who/what is the main focus? Describe appearance, clothing, expression, pose, body language in detail.
   - ENVIRONMENT: Where is the scene? Describe the setting, architecture, nature, weather, time of day, props.
   - LIGHTING: Describe light source, shadows, color temperature, atmosphere (golden hour, neon glow, moonlight, dramatic rim lighting, soft diffused studio light).
   - CAMERA: Specify angle (low angle hero shot, bird's eye, eye level, Dutch angle) and framing (close-up, medium shot, wide establishing).
   - MOOD: Atmospheric elements — fog, rain, lens flare, dust particles, bokeh, smoke, volumetric rays.
   - COLOR PALETTE: Specify dominant colors that match the emotional tone (warm oranges for passion, cool blues for melancholy, vibrant neons for energy).
   - STYLE: ${style}. Must feel premium and cinematic.
   - NO COPYRIGHTED CONTENT: NEVER use copyrighted character names OR their iconic signature details in imagePrompt or visualDescription — image models REJECT these. Reimagine with original visuals. Song lyrics CAN use real names.

4. visualDescription MOTION REQUIREMENTS (be as detailed as possible, no word limit):
   - Describe the specific MOVEMENT and ACTION for the AI video generator.
   - Include camera motion: "camera slowly orbits", "dramatic push-in", "tracking shot following the subject", "crane shot rising upward".
   - Include subject motion: "character turns to face camera", "wind blows through hair", "walks forward through fog", "hands reach toward the sky".
   - Include environmental motion: "clouds drifting", "rain falling", "fire flickering", "leaves swirling in wind", "neon signs flickering".
   - Match motion SPEED to music tempo: slow songs = slow deliberate moves, upbeat songs = dynamic fast cuts.
   - SCENE TRANSITIONS: Each visualDescription must describe how the clip ENDS to cut smoothly into the next section. End with motion decelerating, camera settling, or the subject transitioning (turning, walking away, fading into atmosphere). Avoid ending mid-action.

   ONE ACTION PER SECTION (CRITICAL — AI video models CANNOT handle multiple actions):
   - Each section's imagePrompt and visualDescription must show exactly ONE clear action or moment. NEVER pack multiple actions into one section.
   - BAD: "Brush teeth, wash face, comb hair" — 3 actions crammed together. The video model will produce garbage.
   - GOOD: One section = "Brush teeth with a big grin in front of the bathroom mirror". Next section = "Splash water on face, droplets flying".
   - If lyrics describe a sequence of actions, the imagePrompt/visualDescription should capture only the MOST IMPORTANT single moment from that section.
   - Split dense lyrics across more sections if needed rather than overloading one section's visuals.

5. VISUAL CONTINUITY ACROSS SECTIONS:
   - Maintain a CONSISTENT main character/subject across all sections.
   - Use a coherent color palette throughout (warm tones, cool tones, or a planned color journey).
   - The visual story should have a clear arc: setup → development → climax → resolution.
   - Verse 1 and Verse 2 should show progression (e.g. same character, different situation or later in time).
   - Both Chorus sections should share similar visual energy and color palette but from different angles or compositions.
${niche === "kids" ? `
KIDS MUSIC RULES:
- Write fun, educational, catchy songs for ages 4-10.
- Simple words, lots of repetition, energetic and joyful.
- Visuals must be bright, colorful, and age-appropriate. Never dark or scary.
- Genre should be upbeat pop or playful children's music.
- Characters should be friendly animals, cartoon kids, or colorful fantasy creatures.
` : ""}`;

  const seriesContext = previousTopics.length > 0
    ? `\n\nALBUM CONTINUITY — Think of this as a music album/series. Here are the previous tracks (most recent first):\n${previousTopics.map((t, i) => `  Track ${previousTopics.length - i}: "${t}"`).join("\n")}\n\nYour job is to create the NEXT track. Rules:\n- It should feel like it belongs in the same album — maintain a cohesive mood, genre, and artistic identity\n- NEVER repeat the same topic, lyrics, or melody concept as a previous track\n- Explore a new emotion, story, or perspective that complements what came before\n- If earlier tracks established a narrative arc or recurring motifs, build on them\n- Each track should bring something fresh while feeling connected to the whole`
    : "";

  const userPrompt = topicIdea
    ? `Create a viral ${niche}-themed song about: ${topicIdea}. Visual style: ${style}. The song should be irresistibly catchy.${seriesContext}`
    : `Create a viral ${niche}-themed song. Visual style: ${style}. Pick a topic that resonates emotionally and makes the listener want to replay it.${seriesContext}`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicScriptSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
}

// ── Phase 1: Music Lyrics Only (no visual fields) ──

export async function generateMusicLyrics(
  niche: string,
  style: string,
  topicIdea?: string,
  targetDuration = 60,
  model?: string,
  previousTopics: string[] = [],
  language = "en",
  durations?: number[]
): Promise<MusicLyrics> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite songwriter. You create songs that go viral on TikTok and YouTube Shorts.

OUTPUT LANGUAGE (CRITICAL):
- ALL lyrics, song title, and sectionName MUST be written in ${langName}.
- genre, positiveStyles, and negativeStyles MUST remain in English for best AI compatibility.

SONGWRITING RULES:
1. Write lyrics that are CATCHY, MEMORABLE, and SINGABLE. Use rhyme, repetition, and strong hooks.
2. The chorus should be the most memorable part — repeat it 2-3 times.
3. Keep lyrics SHORT per line (5-10 words). Each line must be at most 200 characters.
4. Match the genre to the niche: ${niche}
5. Total song duration MUST be approximately ${targetDuration} seconds. This is CRITICAL for cost control.
6. ${buildMusicDurationInstruction(targetDuration, durations)}
7. positiveStyles should describe instruments, tempo, and vocal characteristics that match the genre.
8. negativeStyles should list elements that would clash with the desired sound.
${niche === "kids" ? `
KIDS MUSIC RULES:
- Write fun, educational, catchy songs for ages 4-10.
- Simple words, lots of repetition, energetic and joyful.
- Genre should be upbeat pop or playful children's music.
` : ""}`;

  const seriesContext = previousTopics.length > 0
    ? `\n\nALBUM CONTINUITY — Previous tracks:\n${previousTopics.map((t, i) => `  Track ${previousTopics.length - i}: "${t}"`).join("\n")}\n\nCreate the NEXT track. Same album feel, but fresh topic/lyrics. NEVER repeat.`
    : "";

  const userPrompt = topicIdea
    ? `Create a viral ${niche}-themed song about: ${topicIdea}. The song should be irresistibly catchy.${seriesContext}`
    : `Create a viral ${niche}-themed song. Pick a topic that resonates emotionally.${seriesContext}`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicLyricsSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
}

export async function generateStandaloneMusicLyrics(
  prompt: string,
  style: string,
  characters: StoryAsset[] = [],
  targetDuration = 60,
  model?: string,
  language = "en",
  durations?: number[]
): Promise<MusicLyrics> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const charBlock = characters.length > 0
    ? `\n\nCHARACTERS / ASSETS:\n${characters.map((c) => `  - ${c.name} (${c.type}): ${c.description}`).join("\n")}\nReference these in the lyrics where appropriate.\n`
    : "";

  const systemPrompt = `You are an elite songwriter. Create songs that go viral on TikTok and YouTube.

OUTPUT LANGUAGE (CRITICAL):
- ALL lyrics, song title, sectionName MUST be in ${langName}.
- genre, positiveStyles, negativeStyles MUST remain in English.

SONGWRITING RULES:
1. CATCHY, MEMORABLE, SINGABLE lyrics. Rhyme, repetition, strong hooks.
2. Chorus = most memorable part, repeat 2-3 times.
3. SHORT lines (5-10 words, max 200 chars each).
4. Total song duration ~${targetDuration} seconds.
5. ${buildMusicDurationInstruction(targetDuration, durations)}
6. positiveStyles: instruments, tempo, vocals.
7. negativeStyles: elements to avoid.
${charBlock}`;

  const userPrompt = buildInputTypeInstruction(prompt) + `\n\nThe song should be irresistibly catchy.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicLyricsSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
}

// ── Phase 2: Music Visuals (receives actual timestamps) ──

interface VisualSection {
  sectionName: string;
  lyrics: string[];
  durationSec: number;
}

export async function generateMusicVisuals(
  sections: VisualSection[],
  style: string,
  model?: string,
  language = "en",
  supportedClipDurations?: number[]
): Promise<MusicVisuals> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const sectionsContext = sections.map((s, i) =>
    `Section ${i + 1} — "${s.sectionName}" (${s.durationSec}s clip):\n  Lyrics: ${s.lyrics.join(" / ")}`
  ).join("\n\n");

  const clipDurNote = supportedClipDurations?.length
    ? `\n\nVIDEO CLIP DURATIONS: The AI video model only supports clips of exactly ${supportedClipDurations.join(" or ")} seconds. Each section will be rendered as one video clip at its listed duration. Design the motion in your visualDescription to fill exactly that clip length — e.g. a ${Math.min(...supportedClipDurations)}s clip needs quick, punchy motion while a ${Math.max(...supportedClipDurations)}s clip can have slower, more cinematic movement.\nSections labeled "(part N/M)" are sub-clips of a longer original section — their visuals should PROGRESS the narrative (don't repeat the same shot). Part 1 = establish, Part 2 = develop, Part 3 = climax/resolve.`
    : "";

  const systemPrompt = `You are an elite music video director. Given a song's sections (with lyrics and ACTUAL durations from the generated audio), create detailed visual prompts for each section.

The song lyrics are in ${langName}, but ALL imagePrompt and visualDescription MUST be in English.${clipDurNote}

VISUAL-MUSIC SYNC RULES:
1. MATCH ENERGY TO SECTION TYPE:
   - Intro: Establishing shot, slow reveal, atmospheric
   - Verse: Storytelling, medium shots, narrative progression
   - Pre-Chorus: Building tension, camera closer, lighting intensifies
   - Chorus: MAXIMUM energy, wide dynamic shots, vibrant colors
   - Bridge: Contrast, new location, emotional turning point
   - Outro: Resolution, wide pullback, fading light, closure

2. LYRIC-VISUAL LITERALISM: Every section's visuals must directly reference the lyrics.

3. imagePrompt DETAIL (50-100+ words minimum per section):
   - SUBJECT: appearance, clothing, expression, pose
   - ENVIRONMENT: setting, architecture, weather, time of day
   - LIGHTING: light source, shadows, color temperature
   - CAMERA: angle and framing
   - MOOD: atmospheric elements (fog, rain, bokeh, smoke)
   - COLOR PALETTE: dominant colors matching emotional tone
   - STYLE: ${style}
   - NO COPYRIGHTED CONTENT: NEVER use copyrighted character names OR iconic signature details in imagePrompt or visualDescription. Reimagine with original visuals.

4. visualDescription MOTION (CRITICAL — this drives REAL AI video clip generation):
   - Each visualDescription is sent to an image-to-video model to produce an ACTUAL animated clip.
   - Describe SPECIFIC camera motion (dolly, orbit, crane, tracking), subject motion, and environment motion.
   - Match motion speed to the clip duration and music tempo.
   - NEVER write static descriptions — every clip MUST have continuous motion.
   - SCENE TRANSITIONS: Describe how each clip ENDS — motion should decelerate, camera should settle, or the subject should reach a natural resting pose. This prevents jarring hard cuts between sections. End with transitional motion (camera pulling back, subject turning, fading atmosphere) that leads naturally into the next section's opening.

5. ONE ACTION PER SECTION: Each section = ONE clear visual moment.

6. VISUAL CONTINUITY: Consistent main character/subject, coherent color palette across all sections.

You MUST return exactly ${sections.length} sections in the same order.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicVisualSchema,
    system: systemPrompt,
    prompt: `Generate visual prompts for this song:\n\n${sectionsContext}`,
    temperature: 0.8,
  });

  return object;
}

// ── Standalone Script Generation (no series context) ──

export interface StoryAsset {
  name: string;
  description: string;
  type: "character" | "location" | "prop";
}

function buildAssetBlock(assets: StoryAsset[]): string {
  if (assets.length === 0) return "";
  const characters = assets.filter((a) => a.type === "character");
  const locations = assets.filter((a) => a.type === "location");
  const props = assets.filter((a) => a.type === "prop");

  let block = "\n\nSTORY ASSETS (you MUST reference these by exact name in imagePrompt, visualDescription, and assetRefs):";
  if (characters.length > 0) {
    block += "\n  Characters:";
    characters.forEach((c) => { block += `\n    - ${c.name}: ${c.description}`; });
  }
  if (locations.length > 0) {
    block += "\n  Locations:";
    locations.forEach((l) => { block += `\n    - ${l.name}: ${l.description}`; });
  }
  if (props.length > 0) {
    block += "\n  Props:";
    props.forEach((p) => { block += `\n    - ${p.name}: ${p.description}`; });
  }
  block += "\n\nASSET RULES:\n- Every scene's imagePrompt MUST describe the assigned assets using their provided descriptions above. If a scene takes place at a location asset, describe that location exactly as defined. If a character asset appears, describe their appearance as defined.\n- The assetRefs array for each scene MUST list the exact names of all assets visible in that scene.\n- Characters: include when the character is visible in the scene.\n- Locations: include when the scene takes place at that location.\n- Props: include when the prop is visible in the scene.\n";
  return block;
}

function buildInputTypeInstruction(prompt: string): string {
  if (prompt.length < 200) {
    return `Expand this idea into a compelling video narrative. Create a complete story arc with vivid scenes.\n\nIDEA: ${prompt}`;
  }
  return `Adapt the following story into a scene-by-scene video script. Preserve the plot, characters, and key moments. Break it into scenes suitable for short-form video.\n\nSTORY:\n${prompt}`;
}

export async function generateStandaloneMusicScript(
  prompt: string,
  style: string,
  characters: StoryAsset[] = [],
  targetDuration = 60,
  model?: string,
  language = "en",
  durations?: number[]
): Promise<MusicScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite songwriter AND music video director. You create songs that go viral on TikTok and YouTube, paired with cinematic visuals perfectly synchronized with the music.

OUTPUT LANGUAGE (CRITICAL):
- ALL lyrics, song title, and sectionName MUST be written in ${langName}.
- imagePrompt, visualDescription, genre, positiveStyles, negativeStyles MUST remain in English.

SONGWRITING RULES:
1. Write lyrics that are CATCHY, MEMORABLE, and SINGABLE. Use rhyme, repetition, strong hooks.
2. The chorus should be the most memorable part — repeat it 2-3 times.
3. Keep lyrics SHORT per line (5-10 words). Each line must be at most 200 characters.
4. Total song duration MUST be approximately ${targetDuration} seconds.
5. ${buildMusicDurationInstruction(targetDuration, durations)}
6. positiveStyles: instruments, tempo, vocal characteristics matching the genre.
7. negativeStyles: elements that would clash with the desired sound.

VISUAL-MUSIC SYNC RULES:
1. MATCH ENERGY TO SECTION TYPE:
   - Intro: Establishing shot, slow reveal, atmospheric
   - Verse: Storytelling scenes, medium shots, narrative progression
   - Chorus: MAXIMUM energy. Wide dynamic shots, dramatic lighting, vibrant colors
   - Bridge: Contrast — new location, perspective shift, emotional turning point
   - Outro: Resolution. Wide pullback, fading light, closure

2. LYRIC-VISUAL LITERALISM: Every section's visuals must directly reference the lyrics being sung.

3. imagePrompt DETAIL: Be as detailed as possible — subject, environment, lighting, camera angle, mood, color palette, style: ${style}.
   - NO COPYRIGHTED CONTENT: NEVER use copyrighted character names OR their iconic signature details in imagePrompt or visualDescription — image models REJECT these. Reimagine with original visuals. Lyrics CAN use real names.

4. visualDescription MOTION: Specific movement and action for the AI video generator with camera/subject/environmental motion. Each clip must describe how it ENDS — motion decelerating, camera settling, subject reaching a resting pose — to ensure smooth transitions between sections.

ONE ACTION PER SECTION: Each section's visuals must show exactly ONE clear action.

5. VISUAL CONTINUITY: Maintain consistent main character/subject and coherent color palette throughout.
${buildAssetBlock(characters)}`;

  const userPrompt = buildInputTypeInstruction(prompt) + `\n\nVisual style: ${style}. The song should be irresistibly catchy and the visuals cinematic.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicScriptSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
}

// ══════════════════════════════════════════════════════════════════
// ── Multi-Agent Pipeline: Narration, Image, and Motion Agents ──
// ══════════════════════════════════════════════════════════════════

// ── Narration-Only Schemas (Script Agent output) ──

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

// ── Image Agent Output Schema ──

const imagePromptOutputSceneSchema = z.object({
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT (appearance, clothing, expression), ACTION/MOTION, ENVIRONMENT, LIGHTING, CAMERA angle/movement, MOOD/ATMOSPHERE, and STYLE. Single detailed paragraph."),
  assetRefs: z.array(z.string()).default([]).describe("Array of asset names from the STORY ASSETS list that appear in this scene. Include characters who are visible, the location where the scene takes place, and any props that are shown. If no story assets were provided, return an empty array."),
});

const imagePromptOutputSchema = z.object({
  scenes: z.array(imagePromptOutputSceneSchema),
});

export type ImagePromptOutput = z.infer<typeof imagePromptOutputSchema>;

// ── Motion Agent Output Schema ──

const motionOutputSceneSchema = z.object({
  visualDescription: z.string().describe("Rich detailed description of visual action on screen (30-60 words) — camera motion, subject motion, environment motion. Must describe CONTINUOUS MOTION, not a static image. Must also describe how the scene ENDS for smooth transition to the next scene."),
});

const motionOutputSchema = z.object({
  scenes: z.array(motionOutputSceneSchema),
});

export type MotionOutput = z.infer<typeof motionOutputSchema>;

// ── Narration-Only Refinement (for REVIEW_SCRIPT phase) ──

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

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: narrationScriptSchema,
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });

  return object;
}

// ══════════════════════════════════════════════════════════════
// ── Story-First Pipeline: Story, Director, Prompt, Motion ──
// ══════════════════════════════════════════════════════════════

// ── Story Agent (generateText → markdown) ──

export async function generateStory(
  niche: string,
  style: string,
  topicIdea?: string,
  language = "en",
  model?: string,
  previousTopics: string[] = []
): Promise<string> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);

  const seriesContext = previousTopics.length > 0
    ? `\n\nSERIES CONTINUITY — Previous episodes (most recent first):\n${previousTopics.map((t, i) => `  Episode ${previousTopics.length - i}: "${t}"`).join("\n")}\n\nCreate the NEXT episode. Build on the world/theme. NEVER repeat. Explore a fresh angle. Escalate the intrigue.`
    : "";

  const systemPrompt = `You are an elite storyteller. Write a COMPLETE story as flowing prose in markdown format.

OUTPUT FORMAT:
- Start with a # Title (the story's title — SEO-optimized, emotionally compelling)
- Then write the full narration as flowing prose paragraphs
- No scene breaks, no bullet points, no structural formatting beyond paragraphs
- No word limits — write as much as the story needs to be told properly

OUTPUT LANGUAGE (CRITICAL):
- The title and ALL narration MUST be written in ${langName}.
- This rule overrides everything else.

STORYTELLING RULES:
- Open with a line that makes scrolling IMPOSSIBLE (pattern interrupt, shocking claim, mystery)
- Build with specific details — dates, numbers, sensory descriptions, escalating stakes
- Every paragraph must either reveal new information or build tension
- End with something that makes viewers comment, follow, or share
- Write like you're telling a secret to a friend, not giving a lecture
- The story should have a complete arc: hook → build-up → climax → resolution
${niche === "kids" ? `
KIDS CONTENT RULES:
- Target age: 4-10 years old. Simple, cheerful language.
- NO scary, violent, dark, or mature content.
- Fun and educational. Use excitement and wonder.
` : ""}`;

  const userPrompt = topicIdea
    ? `Write a compelling ${niche} story about: ${topicIdea}. The intended visual style is ${style}. Make it impossible to stop reading.${seriesContext}`
    : `Write a compelling ${niche} story. The intended visual style is ${style}. Pick a topic that creates instant curiosity.${seriesContext}`;

  return generateText(systemPrompt, userPrompt, { model: primaryModel, temperature: 0.85 });
}

export async function refineStory(
  currentStory: string,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  language = "en",
  model?: string
): Promise<string> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative story editor. The user has a story and wants to improve it through conversation.

CURRENT STORY:
${currentStory}

RULES:
- Apply the user's requested changes and return the COMPLETE modified story in markdown
- Keep the # Title as the first line
- Only change what the user asks for — preserve everything else exactly as-is
- If the user's request is vague, make your best creative judgment
- You can restructure, expand, shorten, or completely rewrite sections if asked

LANGUAGE RULE:
- The user may write instructions in ANY language, but the story MUST be in ${langName}.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: "user", content: userMessage });

  const { text } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });

  return text;
}

// ── Director Agent (generateObject → structured scenes) ──

const directorSceneSchema = z.object({
  sceneTitle: z.string().describe("Short descriptive title for this scene (2-5 words), like a chapter heading"),
  text: z.string().describe("The narration text chunk for this scene — extracted from the story prose. This is what the viewer HEARS."),
  directorNote: z.string().describe("RICH creative brief for the visual team (NO word limit). Describe: SETTING (exact location, time period, weather, architecture, materials), SUBJECTS (appearance, clothing, posture, expression, age), ACTION (the single physical moment happening), MOOD (emotional atmosphere, color palette, lighting quality), CAMERA (angle, framing — low angle for power, close-up for intimacy, wide for scale), SYMBOLISM (visual metaphors, foreshadowing). Write as if briefing a cinematographer on a film set."),
});

const directorOutputSchema = z.object({
  scenes: z.array(directorSceneSchema),
});

export type DirectorOutput = z.infer<typeof directorOutputSchema>;

export async function splitStoryIntoScenes(
  storyMarkdown: string,
  style: string,
  language = "en",
  model?: string
): Promise<DirectorOutput> {
  const primaryModel = model || LLM.directorModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite film director. Given a complete story, split it into scenes and write a detailed director's note for each.

SCENE SPLITTING RULES:
- Split at natural narrative beats — each scene = ONE clear moment, action, or emotional beat
- NEVER cram multiple actions into one scene
- Each scene's text should be 1-3 sentences from the original story (preserve the original wording as much as possible)
- The text field is what the viewer HEARS as voiceover narration

DIRECTOR NOTE RULES (CRITICAL — this is what makes the video look amazing):
- NO WORD LIMIT. Be as detailed as possible. More detail = better video.
- The visual style is: ${style}. Let this medium inform your creative vision.
- For each scene, describe the COMPLETE visual world:
  - SETTING: Exact location, time period, time of day, weather, architecture, materials, textures, colors
  - SUBJECTS: Who/what is in the scene — appearance, age, ethnicity, clothing, posture, facial expression, hair, body language
  - ACTION: The single physical moment happening — what is moving, what is still
  - MOOD: Emotional atmosphere — tense, joyful, eerie, triumphant. Color palette. Lighting quality (golden hour, harsh fluorescent, candlelight, moonlit)
  - CAMERA: Where the viewer watches from — low angle looking up (power), bird's eye (scale), close-up (intimacy), wide establishing shot (context)
  - SYMBOLISM: Any visual metaphors, foreshadowing, or irony the visual team should convey
- Think like a director writing shot notes for a $100M film production
- Each directorNote should be self-contained — someone reading it should be able to paint the scene
- directorNote MUST be in English (for AI model compatibility)

LANGUAGE RULE:
- sceneTitle and text MUST be in ${langName}
- directorNote MUST be in English`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: directorOutputSchema,
    system: systemPrompt,
    prompt: `Split this story into scenes and write director's notes:\n\n${storyMarkdown}`,
    temperature: 0.7,
  });

  return object;
}

// ── Image Prompt Agent (generateObject → N frames per scene) ──

const framePromptSchema = z.object({
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT, ACTION, ENVIRONMENT, LIGHTING, CAMERA angle, MOOD, STYLE. Single detailed paragraph."),
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

  const systemPrompt = `You are an elite storyboard artist. Given scenes with narration, director's notes, and exact audio durations, create image prompts for each frame.

FRAME CALCULATION:
- Supported video clip durations: ${JSON.stringify(supportedClipDurations)} seconds
- For each scene, you know the exact audio duration. Split the scene into frames using the supported clip durations to cover the full audio (round up — extra time becomes ambient visual pause).
- Example: audio = 14.1s, supported = [5,10] → use 10s + 5s = 2 frames
- Example: audio = 7.3s, supported = [1,2,3,4,5,6,7,8,9,10] → use one 8s frame
- Each frame's clipDuration MUST be one of the supported values

IMAGE PROMPT QUALITY (CRITICAL):
- Each imagePrompt must be 50-100+ words. Be EXTREMELY specific.
- Describe ONE clear subject doing ONE clear action in ONE clear environment.
- Always include the art style: ${style}.
- For people: describe age, ethnicity, clothing, facial expression, body language, hair.
- For places: describe architecture, textures, weather, time of day, materials.
- Include composition cues: camera angle, framing, depth of field, lighting direction.
- EACH frame must be visually DIFFERENT. Vary angles, palettes, compositions.
- For multi-frame scenes: show visual PROGRESSION (frame 1 = establish, frame 2 = develop, frame 3 = climax).

NO COPYRIGHTED CONTENT:
- NEVER use copyrighted character names or their iconic signature details in imagePrompt.
- Reimagine with ORIGINAL details. The narration text may use real names.
${["claymation", "gothic-clay"].includes(style) ? `
CLAYMATION STYLE: Every subject must look handcrafted from clay/plasticine. Visible fingerprint marks, rounded edges, matte finish. Miniature diorama sets. Always include: "Claymation stop-motion style, sculpted clay and plasticine"` : ""}${style === "gothic-clay" ? `
GOTHIC CLAY: Dark moody atmosphere — gothic arches, gray/purple clay, candelabras, cobwebs. Deep purples, dark greens, midnight blues.` : ""}${style === "lego" ? `
LEGO STYLE: Everything built from LEGO bricks. Minifigures with cylindrical heads, C-shaped hands. Visible studs, ABS plastic sheen. Bold primary colors. Always include: "LEGO brick style, plastic toy aesthetic"` : ""}
${sceneContinuity ? `SCENE CONTINUITY: Consecutive frames must be visually COMPATIBLE. Maintain consistent main subject across frames.` : ""}${buildAssetBlock(assets)}

You MUST return exactly ${scenes.length} scenes, each with the appropriate number of frames to cover its audio duration.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: framePromptsOutputSchema,
    system: systemPrompt,
    prompt: `Create storyboard frames for each scene:\n\n${scenesContext}\n\nVisual style: ${style}. Niche: ${niche}.`,
    temperature: 0.8,
  });

  return object;
}

// ── Motion Agent (generateObject with vision → visualDescription per frame) ──

const frameMotionSchema = z.object({
  visualDescription: z.string().describe("Motion description for the AI video model (30-60 words). Describe CONTINUOUS MOTION: camera movement, subject movement, environment movement. Must describe how the clip ENDS for smooth transition to the next frame."),
});

const frameMotionOutputSchema = z.object({
  frames: z.array(frameMotionSchema),
});

export type FrameMotionOutput = z.infer<typeof frameMotionOutputSchema>;

export async function generateFrameMotion(
  frames: Array<{
    imagePrompt: string;
    clipDuration: number;
    sceneText: string;
    directorNote: string;
    sceneTitle: string;
    frameOrder: number;
    sceneOrder: number;
  }>,
  style: string,
  imageUrls: string[],
  model?: string
): Promise<FrameMotionOutput> {
  const primaryModel = model || LLM.motionModel;

  const systemPrompt = `You are an elite video editor. You see ALL frames of the entire video in sequence. Design motion for each frame.

You MUST return exactly ${frames.length} frames in the same sequence order.

MOTION RULES:
- Each visualDescription must be 30-60 words describing CONTINUOUS MOTION
- CAMERA MOTION: "slowly dollies forward", "smooth orbit", "crane shot rising", "tracking shot", "slow push in"
- SUBJECT MOTION: "turns head slowly", "hands reaching forward", "walking through", "wind blowing hair"
- ENVIRONMENT MOTION: "clouds drifting", "rain falling", "leaves swirling", "fire flickering"
- NEVER write static descriptions. Every frame MUST have camera + subject/environment motion.

SEQUENCE AWARENESS (CRITICAL):
- You see the complete video sequence. Design motion considering:
  (1) What comes BEFORE — flow naturally from the previous frame's motion
  (2) The clip duration — match motion speed (short clips = quick motion, long clips = slow cinematic)
  (3) What comes AFTER — end with motion that transitions smoothly to the next frame
- Within a scene (same sceneOrder): frames should feel like continuous progression
- Across scenes (different sceneOrder): the last frame should settle or transition to signal a scene change

MATCH MOTION TO THE IMAGE:
- Look at subject position, depth, lighting direction, composition
- Close-ups → subtle motion (slight head turn, eye movement)
- Wide shots → larger camera movements (dolly, crane, orbit)

Visual style: ${style}.`;

  const hasImages = imageUrls.length === frames.length && imageUrls.every(url => !!url);

  if (hasImages) {
    const contentParts: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [];
    contentParts.push({ type: "text", text: "Here is the complete sequence of frames for the entire video:\n\n" });

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      let header = `--- Frame ${i + 1} | Scene ${f.sceneOrder + 1} "${f.sceneTitle}" | Frame ${f.frameOrder + 1} | ${f.clipDuration}s clip ---`;
      header += `\nNarration: "${f.sceneText}"`;
      header += `\nDirector's Note: ${f.directorNote}`;
      header += `\nImage prompt: ${f.imagePrompt}`;
      header += "\nGenerated image:";
      contentParts.push({ type: "text", text: header });
      contentParts.push({ type: "image", image: new URL(imageUrls[i]) });
      contentParts.push({ type: "text", text: "\n" });
    }

    contentParts.push({ type: "text", text: "\nDesign motion for each frame. Use the director's note for emotional intent, the actual image for physical composition, and the sequence position for transitions." });

    const { object } = await generateObject({
      model: openrouter.chat(primaryModel),
      schema: frameMotionOutputSchema,
      system: systemPrompt,
      messages: [{ role: "user", content: contentParts }],
      temperature: 0.8,
    });

    return object;
  }

  const framesContext = frames.map((f, i) => {
    let entry = `Frame ${i + 1} | Scene ${f.sceneOrder + 1} "${f.sceneTitle}" | Frame ${f.frameOrder + 1} | ${f.clipDuration}s clip`;
    entry += `\nNarration: "${f.sceneText}"`;
    entry += `\nDirector's Note: ${f.directorNote}`;
    entry += `\nImage prompt: ${f.imagePrompt}`;
    return entry;
  }).join("\n\n");

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: frameMotionOutputSchema,
    system: systemPrompt,
    prompt: `Design motion for each frame in sequence:\n\n${framesContext}`,
    temperature: 0.8,
  });

  return object;
}
