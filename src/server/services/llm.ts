import OpenAI from "openai";
import { LLM } from "@/lib/constants";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: LLM.apiKey,
});

interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  model?: string;
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions = {}
): Promise<string> {
  const { maxTokens = 2048, temperature = 0.7, jsonMode = false, model } = options;
  const primaryModel = model || LLM.defaultModel;

  const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: primaryModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: maxTokens,
    temperature,
    ...(jsonMode && { response_format: { type: "json_object" } }),
  };

  try {
    const response = await openrouter.chat.completions.create(requestBody);
    return response.choices[0]?.message?.content ?? "";
  } catch (error) {
    console.warn(
      `Primary model (${primaryModel}) failed, falling back to ${LLM.fallbackModel}`,
      error
    );
    const fallbackResponse = await openrouter.chat.completions.create({
      ...requestBody,
      model: LLM.fallbackModel,
    });
    return fallbackResponse.choices[0]?.message?.content ?? "";
  }
}

export interface VideoScript {
  title: string;
  hook: string;
  scenes: Array<{
    text: string;
    visualDescription: string;
    searchQuery: string;
    imagePrompt: string;
    duration: number;
  }>;
  cta: string;
  totalDuration: number;
}

export async function generateVideoScript(
  niche: string,
  style: string,
  topicIdea?: string,
  targetDuration = 45,
  model?: string
): Promise<VideoScript> {
  const systemPrompt = `You are an elite short-form video scriptwriter who has generated multiple viral videos with 10M+ views on TikTok, YouTube Shorts, and Instagram Reels. You specialize in faceless content.

Your output must be valid JSON matching this exact schema:
{
  "title": "string - SEO-optimized title with emotional trigger words",
  "hook": "string - the opening 1-2 sentences that create an instant curiosity gap (spoken in first 3 seconds)",
  "scenes": [
    {
      "text": "string - narration text for this scene. Must be punchy, conversational, and create micro-cliffhangers between scenes. 1-3 sentences max.",
      "visualDescription": "string - a rich, detailed description of the visual action happening on screen. Describe specific movements, gestures, camera motion, and environment changes. This is used to generate AI video clips so it must describe MOTION and ACTION, not a static image.",
      "searchQuery": "string - 2-4 specific words for stock footage search (backup if AI generation fails)",
      "imagePrompt": "string - A highly detailed prompt for AI video generation. This prompt will first generate a still image, then that image will be animated into a video clip. Write it as a single detailed paragraph covering ALL of these elements:\n1. SUBJECT: Who/what is the main focus? Describe their appearance, clothing, expression, pose in detail.\n2. ACTION/MOTION: What movement or action should happen? (camera slowly zooming in, character walking, wind blowing, water flowing, particles floating). Be specific about the motion direction and speed.\n3. ENVIRONMENT: Where is the scene set? Describe the background, surroundings, objects in the scene.\n4. LIGHTING: Describe the light source, shadows, color temperature (golden hour, moonlight, neon glow, dramatic rim lighting, soft diffused light).\n5. CAMERA: Specify camera angle (low angle, bird's eye, eye level, Dutch angle) and movement (slow push in, orbiting, static, tracking shot).\n6. MOOD/ATMOSPHERE: Fog, rain, dust particles, lens flare, smoke, bokeh, volumetric light rays.\n7. STYLE: ${style} style. Must feel cinematic and high-production.\nThe prompt must match the narration PERFECTLY. Every visual must reinforce what the narrator is saying.",
      "duration": number
    }
  ],
  "cta": "string - call to action",
  "totalDuration": number
}

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
` : ""}`;

  const userPrompt = topicIdea
    ? `Create a ${niche} viral video script about: ${topicIdea}. Visual style: ${style}. Make it impossible to scroll past.`
    : `Create a ${niche} viral video script. Visual style: ${style}. Pick a topic that will make people STOP scrolling and watch till the end. Think: "I need to know what happens next."`;

  const result = await generateText(systemPrompt, userPrompt, {
    maxTokens: 4000,
    temperature: 0.85,
    jsonMode: true,
    model,
  });

  return JSON.parse(result) as VideoScript;
}
