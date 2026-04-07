import { generateObject, generateText as aiGenerateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { LLM } from "@/lib/constants";

export const openrouter = createOpenRouter({
  apiKey: LLM.apiKey,
});

// ── Zod Schemas ──

const videoSceneSchema = z.object({
  text: z.string().describe("Narration text for this scene. Punchy, conversational, micro-cliffhangers. 1-3 sentences max."),
  visualDescription: z.string().describe("Rich detailed description of visual action on screen — movements, gestures, camera motion, environment changes. Must describe MOTION and ACTION, not a static image."),
  searchQuery: z.string().describe("2-4 specific words for stock footage search as backup"),
  imagePrompt: z.string().describe("Highly detailed prompt for AI image generation (50-100+ words). Cover: SUBJECT (appearance, clothing, expression), ACTION/MOTION, ENVIRONMENT, LIGHTING, CAMERA angle/movement, MOOD/ATMOSPHERE, and STYLE. Single detailed paragraph."),
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

// ── Video Script Generation ──

export async function generateVideoScript(
  niche: string,
  style: string,
  topicIdea?: string,
  targetDuration = 45,
  model?: string,
  sceneContinuity = false
): Promise<VideoScript> {
  const primaryModel = model || LLM.defaultModel;

  const systemPrompt = `You are an elite short-form video scriptwriter who has generated multiple viral videos with 10M+ views on TikTok, YouTube Shorts, and Instagram Reels. You specialize in faceless content.

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
- Total duration should be ${targetDuration} seconds
- Aim for 5-7 scenes

IMAGE PROMPT QUALITY (most important — this drives the entire video quality):
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

  const userPrompt = topicIdea
    ? `Create a ${niche} viral video script about: ${topicIdea}. Visual style: ${style}. Make it impossible to scroll past.`
    : `Create a ${niche} viral video script. Visual style: ${style}. Pick a topic that will make people STOP scrolling and watch till the end. Think: "I need to know what happens next."`;

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
  model?: string
): Promise<MusicScript> {
  const primaryModel = model || LLM.defaultModel;

  const systemPrompt = `You are an elite songwriter AND music video director. You create songs that go viral on TikTok and YouTube Shorts, and pair them with cinematic visuals that are PERFECTLY synchronized with the music.

SONGWRITING RULES:
1. Write lyrics that are CATCHY, MEMORABLE, and SINGABLE. Use rhyme, repetition, and strong hooks.
2. The chorus should be the most memorable part — repeat it 2-3 times.
3. Keep lyrics SHORT per line (5-10 words). Each line must be at most 200 characters.
4. Match the genre to the niche: ${niche}
5. Total song duration should be approximately ${targetDuration} seconds.
6. Aim for 5-7 sections: Intro + 2 Verses + 2 Choruses + Bridge/Outro.
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

4. visualDescription MOTION REQUIREMENTS (be as detailed as possible, no word limit):
   - Describe the specific MOVEMENT and ACTION for the AI video generator.
   - Include camera motion: "camera slowly orbits", "dramatic push-in", "tracking shot following the subject", "crane shot rising upward".
   - Include subject motion: "character turns to face camera", "wind blows through hair", "walks forward through fog", "hands reach toward the sky".
   - Include environmental motion: "clouds drifting", "rain falling", "fire flickering", "leaves swirling in wind", "neon signs flickering".
   - Match motion SPEED to music tempo: slow songs = slow deliberate moves, upbeat songs = dynamic fast cuts.

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

  const userPrompt = topicIdea
    ? `Create a viral ${niche}-themed song about: ${topicIdea}. Visual style: ${style}. The song should be irresistibly catchy.`
    : `Create a viral ${niche}-themed song. Visual style: ${style}. Pick a topic that resonates emotionally and makes the listener want to replay it.`;

  const { object } = await generateObject({
    model: openrouter.chat(primaryModel),
    schema: musicScriptSchema,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });

  return object;
}
