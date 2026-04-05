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
  const systemPrompt = `You are a viral short-form video scriptwriter. You create engaging faceless video scripts for social media (TikTok, Reels, Shorts).

Your output must be valid JSON matching this exact schema:
{
  "title": "string - catchy video title",
  "hook": "string - attention-grabbing opening line (first 3 seconds)",
  "scenes": [
    {
      "text": "string - narration text for this scene",
      "visualDescription": "string - description of what should be shown visually",
      "duration": number - seconds for this scene
    }
  ],
  "cta": "string - call to action at the end",
  "totalDuration": number - total video duration in seconds
}

Rules:
- Hook must grab attention in the first 3 seconds
- Each scene should be 5-10 seconds
- Total duration should be close to ${targetDuration} seconds
- Use simple, conversational language
- Create curiosity and suspense
- End with a clear CTA`;

  const userPrompt = topicIdea
    ? `Create a ${niche} video script about: ${topicIdea}. Style: ${style}.`
    : `Create a ${niche} video script. Style: ${style}. Choose an interesting topic that would go viral.`;

  const result = await generateText(systemPrompt, userPrompt, {
    maxTokens: 2048,
    temperature: 0.8,
    jsonMode: true,
  });

  return JSON.parse(result) as VideoScript;
}
