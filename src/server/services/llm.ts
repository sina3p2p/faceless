import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY || "",
});

const PRIMARY_MODEL =
  process.env.OPENROUTER_PRIMARY_MODEL || "openai/gpt-4.1";
const FALLBACK_MODEL =
  process.env.OPENROUTER_FALLBACK_MODEL || "anthropic/claude-sonnet-4-20250514";

interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options: LLMOptions = {}
): Promise<string> {
  const { maxTokens = 2048, temperature = 0.7, jsonMode = false } = options;

  const requestBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
    model: PRIMARY_MODEL,
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
      `Primary model (${PRIMARY_MODEL}) failed, falling back to ${FALLBACK_MODEL}`,
      error
    );
    const fallbackResponse = await openrouter.chat.completions.create({
      ...requestBody,
      model: FALLBACK_MODEL,
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
  targetDuration = 45
): Promise<VideoScript> {
  const systemPrompt = `You are an elite short-form video scriptwriter who has generated multiple viral videos with 10M+ views on TikTok, YouTube Shorts, and Instagram Reels. You specialize in faceless content.

Your output must be valid JSON matching this exact schema:
{
  "title": "string - SEO-optimized title with emotional trigger words",
  "hook": "string - the opening 1-2 sentences that create an instant curiosity gap (spoken in first 3 seconds)",
  "scenes": [
    {
      "text": "string - narration text for this scene. Must be punchy, conversational, and create micro-cliffhangers between scenes. 1-3 sentences max.",
      "visualDescription": "string - what the viewer sees",
      "searchQuery": "string - 2-4 specific words for stock footage search",
      "imagePrompt": "string - AI image generation prompt: describe the exact scene, subject, setting, mood, camera angle, lighting. Must match the narration perfectly. Art style: ${style}.",
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
- imagePrompt must paint a CINEMATIC scene that perfectly matches the narration. Include: main subject, environment, lighting (dramatic/moody/golden hour), camera angle (close-up/wide/aerial), atmosphere (fog/rain/dust particles). Style: ${style}.
- Total duration should be ${targetDuration} seconds
- Aim for 5-7 scenes`;

  const userPrompt = topicIdea
    ? `Create a ${niche} viral video script about: ${topicIdea}. Visual style: ${style}. Make it impossible to scroll past.`
    : `Create a ${niche} viral video script. Visual style: ${style}. Pick a topic that will make people STOP scrolling and watch till the end. Think: "I need to know what happens next."`;

  const result = await generateText(systemPrompt, userPrompt, {
    maxTokens: 3000,
    temperature: 0.85,
    jsonMode: true,
  });

  return JSON.parse(result) as VideoScript;
}
