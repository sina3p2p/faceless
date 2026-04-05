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
  const systemPrompt = `You are a viral short-form video scriptwriter specializing in faceless content for TikTok, Reels, and Shorts.

Your output must be valid JSON matching this exact schema:
{
  "title": "string - catchy video title",
  "hook": "string - attention-grabbing opening line (first 3 seconds)",
  "scenes": [
    {
      "text": "string - narration text for this scene (2-3 sentences max)",
      "visualDescription": "string - detailed description of the visual scene",
      "searchQuery": "string - 2-4 word search query for finding relevant stock footage (be specific and concrete, e.g. 'ancient roman colosseum' not 'historical building')",
      "imagePrompt": "string - detailed prompt for AI image generation if stock footage isn't available. Include: subject, setting, mood, lighting, camera angle. Style: ${style}",
      "duration": number - estimated seconds for this scene based on narration length
    }
  ],
  "cta": "string - call to action at the end",
  "totalDuration": number - total video duration in seconds
}

Critical rules:
- Hook MUST grab attention in the first 3 seconds with a shocking fact, question, or bold claim
- Each scene narration should be 2-3 sentences, roughly 5-8 seconds when spoken
- Total duration should be close to ${targetDuration} seconds
- searchQuery must be CONCRETE and SPECIFIC to the scene content (e.g. "dark forest fog night" not "scary background")
- imagePrompt must describe a SPECIFIC image that directly illustrates the narration
- Use simple, dramatic, conversational language
- Build suspense throughout
- End with a compelling CTA that creates FOMO`;

  const userPrompt = topicIdea
    ? `Create a ${niche} video script about: ${topicIdea}. Visual style: ${style}. Make it dramatic and engaging.`
    : `Create a ${niche} video script. Visual style: ${style}. Choose a specific, fascinating topic that would go viral. Make it dramatic and engaging.`;

  const result = await generateText(systemPrompt, userPrompt, {
    maxTokens: 3000,
    temperature: 0.8,
    jsonMode: true,
  });

  return JSON.parse(result) as VideoScript;
}
