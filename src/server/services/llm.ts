import { generateObject, generateText as aiGenerateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";

export const openrouter = createOpenRouter({
  apiKey: LLM.apiKey,
});

// ── Zod Schemas ──

const videoSceneSchema = z.object({
  text: z.string().describe("Narration text for this scene. Punchy, conversational, micro-cliffhangers. 1-3 sentences max."),
  visualDescription: z.string().describe("Rich detailed description of visual action on screen — movements, gestures, camera motion, environment changes. Must describe MOTION and ACTION, not a static image."),
  searchQuery: z.string().describe("2-4 specific words for stock footage search as backup"),
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

export async function refineVideoScript(
  currentScript: VideoScript,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  model?: string,
  language = "en"
): Promise<VideoScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are a collaborative video script editor. The user has a video script and wants to improve it through conversation.

CURRENT SCRIPT:
${JSON.stringify(currentScript, null, 2)}

RULES:
- Apply the user's requested changes to the script and return the COMPLETE modified script
- Only change what the user asks for — preserve everything else exactly as-is
- If the user asks to change a specific scene, only modify that scene
- If the user asks for tone/style changes, apply them across all scenes
- Keep all imagePrompts detailed (50-100+ words) — never shorten them
- NO COPYRIGHTED CONTENT in imagePrompt or visualDescription — image models REJECT these. Avoid character names AND their iconic signature details (e.g. "glass slippers", "ice-blue gown" = Cinderella). Reimagine with original visuals. Narration text CAN use the real names.
- Maintain the same JSON structure
- If the user's request is vague, make your best creative judgment
- You can add, remove, reorder, or merge scenes if the user asks
- ONE ACTION PER SCENE: Each scene must show exactly ONE clear action. If a scene has multiple actions (e.g. "brush teeth, wash face, comb hair"), split them into separate scenes. AI video models cannot handle multiple actions in one clip.

LANGUAGE RULE (CRITICAL):
- The user may write their instructions in ANY language, but the script output (title, hook, narration text, CTA) MUST ALWAYS be written in ${langName}.
- imagePrompt, visualDescription, and searchQuery should remain in English for best AI model compatibility.
- Never switch the script language based on the user's input language. Always output narration in ${langName}.`;

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of chatHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  messages.push({ role: "user", content: userMessage });

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: videoScriptSchema,
    system: systemPrompt,
    messages,
    temperature: 0.7,
  });

  return object;
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

// ── Video Script Generation ──

export async function generateVideoScript(
  niche: string,
  style: string,
  topicIdea?: string,
  targetDuration = 45,
  model?: string,
  sceneContinuity = false,
  previousTopics: string[] = [],
  language = "en",
  durations?: number[]
): Promise<VideoScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite short-form video scriptwriter who has generated multiple viral videos with 10M+ views on TikTok, YouTube Shorts, and Instagram Reels. You specialize in faceless content.

OUTPUT LANGUAGE (CRITICAL — do NOT ignore):
- ALL text content (title, hook, scene narration/text, CTA) MUST be written in ${langName}.
- imagePrompt, visualDescription, and searchQuery MUST remain in English for best AI model compatibility.
- This rule overrides everything else. Even if the topic or niche name is in a different language, the output narration must be in ${langName}.

VIRAL SCRIPT FORMULA (follow this exactly):

1. HOOK (scene 1): Start with a pattern interrupt. Use one of these proven formats:
   - "This [thing] was hidden for [time] and nobody knew why..."
   - "Scientists can't explain why [shocking claim]..."
   - "In [year], something happened that changed everything..."
   - A bold controversial statement or impossible-sounding fact
   The hook must make scrolling IMPOSSIBLE.

2. BUILD-UP (scenes 2-3): Layer information that deepens curiosity. Each scene must end with an implicit "but then..." that pulls the viewer to the next scene. Use:
   - Specific numbers and dates (they feel more credible)
   - Sensory details ("the room went silent", "a chill ran down...")
   - Escalating stakes

3. CLIMAX (scene 4-5): The payoff. Reveal the most shocking/interesting part. This is where retention spikes.

4. CTA (final scene): End with something that makes them comment, like, or follow. Best: ask a polarizing question or tease the "Part 2".

CRITICAL RULES:
- Each scene narration = 15-25 words. Short punchy sentences WIN.
- NEVER use filler words or generic phrases
- Write like you're telling a secret to a friend, not giving a lecture
- Every single sentence must either reveal new info or build tension
- searchQuery must be HYPER-SPECIFIC (e.g. "abandoned underground bunker" not "dark place")
${buildDurationInstruction(targetDuration, durations)}

ONE ACTION PER SCENE (CRITICAL — AI video models CANNOT handle multiple actions):
- Each scene must show exactly ONE clear action or moment. NEVER pack multiple actions into one scene.
- BAD: "Brush teeth, wash face, and comb hair" — this is 3 separate actions crammed together. The video model will fail or produce garbage.
- GOOD: Scene 1 = "Brush teeth with a big smile", Scene 2 = "Splash water on face", Scene 3 = "Comb hair in the mirror"
- If the story needs multiple actions, SPLIT them into separate scenes. More scenes with single actions is ALWAYS better than fewer scenes with multiple actions.
- The visualDescription and imagePrompt must also describe only ONE moment/pose/action, never a sequence.

VISUAL DESCRIPTION — AI VIDEO MOTION PROMPT (CRITICAL — this drives REAL video clip generation):
- The visualDescription field is sent directly to an AI image-to-video model to generate REAL video clips (NOT just images with zoom).
- Each visualDescription must be 30-60 words describing CONTINUOUS MOTION:
  - CAMERA MOTION: "camera slowly dollies forward", "smooth orbit around the subject", "crane shot rising upward", "tracking shot following the character", "slow push in on face"
  - SUBJECT MOTION: "character turns head slowly", "hands reaching forward", "walking through the corridor", "wind blowing through hair"
  - ENVIRONMENT MOTION: "clouds drifting across the sky", "rain falling", "leaves swirling in the wind", "fire flickering"
- BAD visualDescription: "A man standing in a room" (STATIC — produces a boring frozen image, not video)
- GOOD visualDescription: "Camera slowly pushes in on the man's face as his eyes widen with realization, shadows shifting across the dimly lit room, dust particles floating in a beam of light"
- NEVER write static descriptions. Every visualDescription MUST contain at least one camera movement AND one subject/environment movement.

IMAGE PROMPT QUALITY (drives the key frame image for each video clip):
- Each imagePrompt must be 50-100 words minimum. SHORT/LAZY prompts = ugly videos.
- NEVER write vague prompts like "a mysterious scene" or "something dramatic happens". Be EXTREMELY specific.
- Describe ONE clear subject doing ONE clear action in ONE clear environment. Do NOT cram multiple unrelated things.
- Always include the art style: ${style}.
- For people: describe age, ethnicity, clothing, facial expression, body language, hair.
- For places: describe architecture, textures, weather, time of day, vegetation, materials.
- For objects: describe size, material, color, condition, position relative to camera.
- Include motion cues: "camera slowly pushes in", "wind gently moves the curtains", "smoke rises from the ground", "waves crash against rocks".
- EACH scene's imagePrompt must be visually DIFFERENT from the others. Vary camera angles, color palettes, and compositions across scenes.
- Think like a cinematographer — every frame should be visually stunning enough to pause and admire.
- NO COPYRIGHTED CONTENT IN IMAGE PROMPTS (CRITICAL): NEVER use trademarked or copyrighted character names (e.g. "Cinderella", "Elsa", "Spider-Man", "Mickey Mouse") in imagePrompt or visualDescription. Also avoid their ICONIC signature details that make the character instantly recognizable to content filters (e.g. "glass slippers" = Cinderella, "ice powers" = Elsa, "web-shooting" = Spider-Man). Image models will REJECT prompts that are too close to copyrighted characters. Instead, reimagine the character with ORIGINAL details. Example: instead of Cinderella with "glass slippers and ice-blue ball gown at a grand ball", write "a young woman with golden braided hair wearing an elegant silver gown with pearl embroidery, descending the steps of a candlelit palace hall". The narration text CAN use the real names — only imagePrompt and visualDescription must be original.
${["claymation", "gothic-clay"].includes(style) ? `
CLAYMATION STYLE RULES (CRITICAL — follow these for every imagePrompt):
- Every subject, object, and environment MUST look like it is handcrafted from clay, plasticine, or polymer clay
- Describe visible clay textures: fingerprint marks, smooth rounded edges, slightly imperfect surfaces, soft matte finish
- Environments must look like miniature handmade diorama sets with clay props and sculpted backdrops
- Characters should have exaggerated proportions: slightly oversized heads, rounded features, stubby fingers, visible seam lines
- Lighting should mimic a stop-motion studio: soft diffused overhead lighting, subtle shadows, warm color temperature
- Include material callouts in every prompt: "sculpted from colorful plasticine", "clay figure with visible texture", "handcrafted miniature set piece"
- Props and objects should look molded: "clay smartphone", "plasticine coffee cup", "sculpted clay castle walls"
- Backgrounds: handmade painted backdrops, cardboard and clay scenery, miniature buildings and trees made of clay
- ALWAYS start or end imagePrompt with: "Claymation stop-motion style, everything made of sculpted clay and plasticine"` : ""}${style === "gothic-clay" ? `
GOTHIC CLAY VARIANT (apply ON TOP of claymation rules):
- Dark moody atmosphere — gothic arches, stone castle walls made of gray and purple clay, candelabras with clay flames, stained glass, cobwebs
- Color palette: deep purples, dark greens, charcoal grays, midnight blues, with pops of color on the main character
- Characters wear dramatic clothing: fur coats, velvet capes, dark dresses, sunglasses — all sculpted from clay
- Environment is always a gothic setting: clay castles, cathedrals, haunted mansions, dark forests — all as miniature clay dioramas
- Mood: mysterious, elegant, slightly eerie but stylish — think Tim Burton meets Wallace and Gromit` : ""}
${niche === "kids" ? `
KIDS CONTENT RULES (this overrides tone guidelines above):
- Target age: 4-10 years old
- Use simple, cheerful language a child can understand
- NO scary, violent, dark, or mature content whatsoever
- Make it FUN and EDUCATIONAL — teach something cool (animals, space, dinosaurs, nature, science experiments, fun facts)
- Use excitement and wonder instead of tension ("Guess what?!", "How cool is THAT?!")
- Narration should sound like a friendly, enthusiastic teacher or storyteller
- imagePrompt should be colorful, bright, cartoonish or playful — never dark or moody
- searchQuery should target kid-friendly footage (colorful animals, space, nature, cartoons)
- CTA should be fun: "Which one was YOUR favorite?" or "Can you guess what happens next?"
` : ""}${sceneContinuity ? `
SCENE CONTINUITY MODE (CRITICAL — follow these rules):
- Video clips will be generated using IMAGE PAIRS: each clip transitions from scene N's image to scene N+1's image.
- This means each scene's imagePrompt must create a visually COMPATIBLE image with its neighbors. Avoid extreme visual jumps between consecutive scenes (e.g. don't go from underwater to outer space).
- Maintain a CONSISTENT main subject/character across all scenes. If the first scene shows a character, keep that same character visible in subsequent scenes.
- You MUST add one EXTRA FINAL scene at the end (the "ending scene"). This scene serves as the visual closing frame of the video.
- The ending scene should be a visually striking conclusion: the main subject in a final pose, a wide establishing shot, or a stylized CTA composition (e.g. "camera pulls back to reveal a beautiful panoramic view", or "the character turns to the camera with a knowing smile").
- The ending scene's narration should contain the CTA.
- Total scenes should be 6-8 (including the ending scene).
` : ""}`;

  const seriesContext = previousTopics.length > 0
    ? `\n\nSERIES CONTINUITY — Think of this as a Netflix-style series. Here are the previous episodes (most recent first):\n${previousTopics.map((t, i) => `  Episode ${previousTopics.length - i}: "${t}"`).join("\n")}\n\nYour job is to create the NEXT episode. Rules:\n- Build on the world/theme established by previous episodes — viewers should feel this belongs in the same series\n- Reference or connect to earlier episodes when it makes sense (e.g. "remember when we talked about X? Well..."), but the video MUST stand on its own\n- NEVER repeat the same topic, story, or script as a previous episode\n- Explore a fresh angle, a deeper layer, a sequel, a related mystery, or the "other side of the story"\n- If the series has a recurring character/narrator persona, maintain it\n- Escalate — each episode should feel like the stakes or intrigue are building`
    : "";

  const userPrompt = topicIdea
    ? `Create a ${niche} viral video script about: ${topicIdea}. Visual style: ${style}. Make it impossible to scroll past.${seriesContext}`
    : `Create a ${niche} viral video script. Visual style: ${style}. Pick a topic that will make people STOP scrolling and watch till the end. Think: "I need to know what happens next."${seriesContext}`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: videoScriptSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
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

export async function generateStandaloneScript(
  prompt: string,
  style: string,
  characters: StoryAsset[] = [],
  targetDuration = 45,
  model?: string,
  sceneContinuity = true,
  language = "en",
  durations?: number[]
): Promise<VideoScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const systemPrompt = `You are an elite short-form video scriptwriter. You create compelling visual stories for TikTok, YouTube Shorts, and Instagram Reels.

OUTPUT LANGUAGE (CRITICAL — do NOT ignore):
- ALL text content (title, hook, scene narration/text, CTA) MUST be written in ${langName}.
- imagePrompt, visualDescription, and searchQuery MUST remain in English for best AI model compatibility.
- This rule overrides everything else. Even if the story is in a different language, the output narration must be in ${langName}.

STORYTELLING RULES:
1. HOOK (scene 1): Start with a captivating opening that makes scrolling impossible. Establish the story's world immediately.
2. BUILD-UP (scenes 2-4): Develop the story with vivid details, escalating tension or wonder. Each scene must end with an implicit pull to the next.
3. CLIMAX (scene 4-5): The emotional peak — the most dramatic, surprising, or touching moment.
4. RESOLUTION (final scene): A satisfying conclusion with a CTA that invites engagement.

CRITICAL RULES:
- Each scene narration = 15-25 words. Short punchy sentences.
${buildDurationInstruction(targetDuration, durations)}
- searchQuery must be HYPER-SPECIFIC

ONE ACTION PER SCENE (CRITICAL — AI video models CANNOT handle multiple actions):
- Each scene must show exactly ONE clear action or moment.
- BAD: "She opens the door, walks in, and sits down" — 3 actions.
- GOOD: Scene 1 = "She opens the door", Scene 2 = "She walks into the room", Scene 3 = "She sits down"
- The visualDescription and imagePrompt must describe only ONE moment/pose/action.

VISUAL DESCRIPTION — AI VIDEO MOTION PROMPT (CRITICAL — this drives REAL video clip generation):
- The visualDescription field is sent directly to an AI image-to-video model to generate REAL video clips (NOT just images with zoom).
- Each visualDescription must be 30-60 words describing CONTINUOUS MOTION:
  - CAMERA MOTION: "camera slowly dollies forward", "smooth orbit around the character", "crane shot rising upward", "tracking shot following the subject", "slow push in on face"
  - SUBJECT MOTION: "character turns head slowly to the left", "hands reaching forward", "walking through the corridor", "wind blowing through hair"
  - ENVIRONMENT MOTION: "clouds drifting across the sky", "rain falling", "leaves swirling in the wind", "fire flickering"
- BAD visualDescription: "A woman standing in a garden" (STATIC — this produces a boring frozen image, not a video)
- GOOD visualDescription: "Camera slowly pushes in on the woman as she turns to face the viewer, wind gently moving her hair, flower petals drifting past in the warm afternoon light"
- NEVER write static descriptions. Every visualDescription MUST contain at least one camera movement AND one subject/environment movement.

IMAGE PROMPT QUALITY (drives the key frame image for each video clip):
- Each imagePrompt must be 50-100 words minimum.
- NEVER write vague prompts. Be EXTREMELY specific.
- Describe ONE clear subject doing ONE clear action in ONE clear environment.
- Always include the art style: ${style}.
- For people: describe age, ethnicity, clothing, facial expression, body language, hair.
- For places: describe architecture, textures, weather, time of day, vegetation, materials.
- Include motion cues: "camera slowly pushes in", "wind moves the curtains", etc.
- EACH scene's imagePrompt must be visually DIFFERENT. Vary camera angles, color palettes, and compositions.
- NO COPYRIGHTED CONTENT IN IMAGE PROMPTS (CRITICAL): NEVER use copyrighted character names OR their iconic signature details (e.g. "glass slippers", "ice powers", "web-shooting") in imagePrompt or visualDescription — image models REJECT these. Reimagine characters with ORIGINAL visual details. Narration text CAN use real names.
${["claymation", "gothic-clay"].includes(style) ? `
CLAYMATION STYLE RULES:
- Every subject must look handcrafted from clay/plasticine with visible fingerprint marks, rounded edges, matte finish
- Environments must look like miniature handmade diorama sets
- Characters: exaggerated proportions, oversized heads, rounded features, visible seam lines
- Always include: "Claymation stop-motion style, everything made of sculpted clay and plasticine"` : ""}${style === "gothic-clay" ? `
GOTHIC CLAY VARIANT:
- Dark moody atmosphere: gothic arches, stone walls of gray/purple clay, candelabras, cobwebs
- Color palette: deep purples, dark greens, charcoal grays, midnight blues
- Mood: mysterious, elegant, slightly eerie but stylish` : ""}${sceneContinuity ? `
SCENE CONTINUITY MODE (CRITICAL):
- Video clips transition from scene N's image to scene N+1's image.
- Each imagePrompt must be visually COMPATIBLE with neighbors.
- Maintain a CONSISTENT main subject/character across all scenes.
- Add one EXTRA FINAL scene as the visual closing frame (ending scene with CTA narration).
- Total scenes should be 6-8 (including the ending scene).` : ""}${buildAssetBlock(characters)}`;

  const userPrompt = buildInputTypeInstruction(prompt) + `\n\nVisual style: ${style}. Make it visually stunning and emotionally compelling.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: videoScriptSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
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

4. visualDescription MOTION: Specific movement and action for the AI video generator with camera/subject/environmental motion.

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

// ── Dialogue Script Generation ──

const dialogueSceneSchema = z.object({
  speaker: z.string().describe("Who is speaking: exact character name or 'Narrator'"),
  text: z.string().describe("What this character says, or narrator description"),
  visualDescription: z.string().describe("MOTION PROMPT for the AI video generator (30-60 words). Describe the speaking character's gestures, head tilts, hand movements, lip sync, facial expression changes, and camera motion (slow push in, orbit, over-the-shoulder). Must describe CONTINUOUS MOTION, not a static pose."),
  imagePrompt: z.string().describe("Detailed prompt for AI image generation (50-100+ words). Show the speaking character clearly."),
  assetRefs: z.array(z.string()).default([]).describe("Array of asset names from the STORY ASSETS list that appear in this scene. Include the speaking character, the location, and any visible props."),
  searchQuery: z.string().describe("2-4 specific words for stock footage search as backup"),
  duration: z.number().describe("Duration of this scene in seconds"),
});

const dialogueScriptSchema = z.object({
  title: z.string().describe("Title for this dialogue video"),
  hook: z.string().describe("Brief hook or setup for the conversation"),
  scenes: z.array(dialogueSceneSchema),
  cta: z.string().describe("Call to action at the end"),
  totalDuration: z.number().describe("Total video duration in seconds"),
});

export type DialogueScript = z.infer<typeof dialogueScriptSchema>;

export async function generateDialogueScript(
  prompt: string,
  style: string,
  characters: StoryAsset[],
  targetDuration = 45,
  model?: string,
  sceneContinuity = false,
  language = "en",
  durations?: number[]
): Promise<DialogueScript> {
  const primaryModel = model || LLM.defaultModel;
  const langName = getLanguageName(language);

  const charList = characters.map((c) => `  - ${c.name}: ${c.description}`).join("\n");

  const systemPrompt = `You are an elite dialogue scriptwriter for short-form video. You create compelling conversations between characters for TikTok, YouTube Shorts, and Instagram Reels.

OUTPUT LANGUAGE (CRITICAL — do NOT ignore):
- ALL text content (title, hook, dialogue text, CTA) MUST be written in ${langName}.
- imagePrompt, visualDescription, and searchQuery MUST remain in English for best AI model compatibility.

DIALOGUE RULES:
1. Each scene is ONE character's spoken turn (or a Narrator line for scene-setting).
2. The "speaker" field must be the EXACT character name from the list below, or "Narrator" for narration.
3. Alternate between characters naturally. Don't have the same character speak twice in a row unless dramatically appropriate.
4. Narrator lines should be used sparingly for scene-setting, transitions, or dramatic emphasis — NOT for every turn.
5. Each character should have a distinct speaking style that reflects their personality.
6. Build dramatic tension, humor, or emotional depth through the conversation.
7. End with a satisfying or cliffhanger conclusion.

CHARACTERS (CRITICAL — only these speakers are valid):
${charList}

SCENE STRUCTURE:
- Start with a hook that pulls viewers in (a Narrator intro or a character's provocative opening line).
- Build the conversation with escalating stakes, reveals, or comedy.
- Each scene = one speaker's turn. Keep dialogue lines 10-25 words.
- Total conversation should feel like a natural exchange, not scripted Q&A.
${buildDurationInstruction(targetDuration, durations)}

VISUAL DESCRIPTION — AI VIDEO MOTION PROMPT (CRITICAL — this drives REAL video clip generation):
- The visualDescription is sent to an AI image-to-video model to generate REAL animated video clips.
- Each visualDescription must be 30-60 words describing CONTINUOUS MOTION:
  - Show the speaking character's gestures, head tilts, lip movements, hand gestures, expression changes.
  - Include camera motion: "slow push in", "over-the-shoulder shot", "camera orbits to reveal the other character".
- BAD: "Character A standing and talking" (STATIC)
- GOOD: "Camera slowly pushes in on Character A's face as she leans forward, eyes narrowing with suspicion, gesturing emphatically with her right hand, warm lamplight flickering across her features"

IMAGE PROMPT QUALITY (drives the key frame image for each video clip):
- Each imagePrompt must be 50-100 words minimum.
- Show the SPEAKING CHARACTER prominently — their face, expression, and body language.
- Always include the art style: ${style}.
- For Narrator scenes, show the environment or both characters.
- EACH scene's imagePrompt must be visually DIFFERENT. Vary camera angles, expressions, and compositions.
- NO COPYRIGHTED CONTENT IN IMAGE PROMPTS: Reimagine characters with original visual details.
${["claymation", "gothic-clay"].includes(style) ? `
CLAYMATION STYLE RULES:
- Every subject must look handcrafted from clay/plasticine
- Include: "Claymation stop-motion style, everything made of sculpted clay and plasticine"` : ""}${sceneContinuity ? `
SCENE CONTINUITY MODE:
- Maintain consistent character appearances across all scenes.
- Visual style and environment should feel cohesive.` : ""}${buildAssetBlock(characters.filter((c) => c.type !== "character"))}

ASSET REFS: For each scene, the assetRefs array must include the speaking character's name plus any location or prop assets visible in the scene.`;

  const userPrompt = buildInputTypeInstruction(prompt) + `\n\nVisual style: ${style}. Create an engaging dialogue between the characters that feels natural and compelling.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: dialogueScriptSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
}
