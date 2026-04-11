import { generateText as aiGenerateText } from "ai";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, type ChatMessage } from "./index";

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

// ── Story Agent (generateText → markdown) ──

export async function generateStory(
  niche: string,
  style: string,
  topicIdea?: string,
  language = "en",
  model?: string,
  previousTopics: string[] = [],
  videoType?: string
): Promise<string> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);
  const isMusic = videoType === "music_video";

  const seriesContext = previousTopics.length > 0
    ? `\n\nSERIES CONTINUITY — Previous episodes (most recent first):\n${previousTopics.map((t, i) => `  Episode ${previousTopics.length - i}: "${t}"`).join("\n")}\n\nCreate the NEXT episode. Build on the world/theme. NEVER repeat. Explore a fresh angle. Escalate the intrigue.`
    : "";

  const systemPrompt = isMusic
    ? `You are an elite songwriter. Write COMPLETE song lyrics in markdown format.

OUTPUT FORMAT:
- Start with a # Song Title (catchy, memorable)
- On the next line write: Genre: [genre/style description for the AI music generator, e.g. "pop, upbeat, catchy, female vocals"]
- Then use ## Section Name (e.g. ## Intro, ## Verse 1, ## Chorus, ## Verse 2, ## Bridge, ## Outro) for each section
- Write singable lyrics under each section — short lines, good rhythm, rhyme where natural
- A typical song has 4-8 sections

OUTPUT LANGUAGE (CRITICAL):
- The title and ALL lyrics MUST be written in ${langName}.
- The Genre line should remain in English for AI music model compatibility.

SONGWRITING RULES:
- The chorus must be catchy and repeatable
- Verses build the story, chorus delivers the emotional hook
- Keep lines short (4-10 words) for natural singing rhythm
- Use vivid imagery and emotional language
- The song should tell a story or convey a strong emotion
${niche === "kids" ? `
KIDS CONTENT RULES:
- Target age: 4-10 years old. Simple, fun, singable.
- NO scary or mature content. Educational and joyful.
` : ""}`
    : `You are an elite storyteller. Write a COMPLETE story as flowing prose in markdown format.

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

  const userPrompt = isMusic
    ? (topicIdea
      ? `Write a catchy ${niche}-themed song about: ${topicIdea}. The music video visual style will be ${style}.${seriesContext}`
      : `Write a catchy ${niche}-themed song. The music video visual style will be ${style}. Pick a topic that resonates emotionally.${seriesContext}`)
    : (topicIdea
      ? `Write a compelling ${niche} story about: ${topicIdea}. The intended visual style is ${style}. Make it impossible to stop reading.${seriesContext}`
      : `Write a compelling ${niche} story. The intended visual style is ${style}. Pick a topic that creates instant curiosity.${seriesContext}`);

  return generateText(systemPrompt, userPrompt, { model: primaryModel, temperature: 0.85 });
}

// ── Story Refinement ──

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
