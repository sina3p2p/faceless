import { generateText as aiGenerateText } from "ai";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, type ChatMessage } from "./index";
import type { CreativeBrief } from "@/types/pipeline";

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
  style: string,
  topicIdea: string,
  language = "en",
  model?: string,
  videoType?: string,
  brief?: CreativeBrief
): Promise<string> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);
  const isMusic = videoType === "music_video";

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
- The song should tell a story or convey a strong emotion`

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
${brief ? `
CREATIVE BRIEF (follow these constraints):
- Concept: ${brief.concept}
- Tone: ${brief.tone}
- Narrative arc: ${brief.narrativeArc}
- Target audience: ${brief.targetAudience}
- Word budget: aim for approximately ${brief.durationGuidance.wordBudgetTarget} words (range: ${brief.durationGuidance.wordBudgetMin}–${brief.durationGuidance.wordBudgetMax})
- Narration style: ${brief.formatConstraints.narrationStyle === "voiceover" ? "Write as voiceover narration — a narrator tells the story" : brief.formatConstraints.narrationStyle === "dialogue" ? "Write dialogue between characters — no narrator" : "Mix narration with occasional dialogue"}
- Opening hook: ${brief.formatConstraints.openingHook === "question" ? "Open with a provocative question" : brief.formatConstraints.openingHook === "claim" ? "Open with a bold, surprising claim" : brief.formatConstraints.openingHook === "mystery" ? "Open by withholding key information — create mystery" : "Open mid-action — drop the reader into the middle of something happening"}
- Dialogue density: ${brief.formatConstraints.dialogueDensity}
- Resolution: ${brief.formatConstraints.resolutionType === "closed" ? "Complete, satisfying ending" : brief.formatConstraints.resolutionType === "open" ? "Ambiguous, thought-provoking ending" : "Unresolved tension — leave them wanting more"}
` : ""}`;

  const userPrompt = isMusic
    ? `Write a catchy song about: ${topicIdea}. The music video visual style will be ${style}.`
    : `Write a compelling story about: ${topicIdea}. The intended visual style is ${style}. Make it impossible to stop reading.`;

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
