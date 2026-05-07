import { generateText as aiGenerateText } from "ai";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, type ChatMessage } from "./index";
import type { BeatSheet, CreativeBrief, ResearchPackWithClaims } from "@/types/pipeline";
import { formatResearchEvidence } from "./research-evidence";
import { formatBeatSheetForPrompt } from "./beat-sheet";
import { recordAiCall } from "@/server/services/ai-audit";

// ── Generic text generation (for non-structured calls) ──

export async function generateText(
  systemPrompt: string,
  userPrompt: string,
  options: { maxOutputTokens?: number; temperature?: number; model?: string; seed?: number } = {}
): Promise<string> {
  const { maxOutputTokens, temperature = 0.7, model, seed } = options;
  const primaryModel = model || LLM.defaultModel;

  const { text } = await recordAiCall(
    {
      provider: "openrouter",
      model: primaryModel,
      operation: "llm.generateText",
      request: { system: systemPrompt, prompt: userPrompt, temperature, maxOutputTokens, seed },
      summarize: (r) => ({ length: (r as { text?: string }).text?.length ?? 0 }),
    },
    () =>
      aiGenerateText({
        model: openrouter.chat(primaryModel),
        system: systemPrompt,
        prompt: userPrompt,
        temperature,
        ...(maxOutputTokens && { maxOutputTokens }),
        ...(seed !== undefined && { seed }),
      }),
  );

  return text;
}

// ── Story Agent (generateText → markdown) ──

export async function generateStory(
  style: string,
  topicIdea: string,
  language = "en",
  model?: string,
  brief?: CreativeBrief,
  researchPack?: ResearchPackWithClaims | null,
  seed?: number,
  beatSheet?: BeatSheet,
): Promise<string> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);
  const researchBlock = researchPack?.claims?.length ? `\n\n${formatResearchEvidence(researchPack)}` : "";
  const beatSheetBlock = beatSheet ? `\n\n${formatBeatSheetForPrompt(beatSheet)}` : "";

  const systemPrompt = `You are an elite storyteller. Static stories die in the first three seconds. Your job is to make this one MOVE.

OUTPUT FORMAT:
- Start with a # Title (SEO-optimized, emotionally compelling)
- Then write the full narration as flowing prose paragraphs
- No scene breaks, no bullet points, no structural formatting beyond paragraphs
- No word limits — write as much as the story needs to be told properly

OUTPUT LANGUAGE (CRITICAL):
- The title and ALL narration MUST be written in ${langName}.
- This rule overrides everything else.

DYNAMICS — non-negotiable (a story without these is a static story):
- AT LEAST ONE REVERSAL: somewhere mid-to-late, the reader's expectation must flip. Set something up early, then break it. If the beat sheet marks a beat as REVERSAL, that's the one — land it hard.
- TONAL SHIFTS BETWEEN PARAGRAPHS: do not stay in one register. Move between tension and relief, dread and warmth, intrigue and humor. A flat tone is the #1 cause of "boring".
- SENSORY VARIATION: don't lean on the same sense twice in a row. Sight → sound → smell → touch. Avoid stacking adjectives — pick one specific sensory hit per beat and let it land.
- A REAL VOICE: the narrator must have a stance — opinions, contradictions, asides, a perspective. "Neutral observer" is forbidden. If a beat sheet voice is provided, channel it.
- ESCALATING SPECIFICITY: each beat should reveal something concrete (a name, a number, an object, a turn) — not just "things get worse".
- AT LEAST ONE QUIET BEAT before the climax: a moment where things slow down, breathe, or look briefly OK. The next escalation lands harder because of it.

STORYTELLING RULES:
- Open with a line that makes scrolling IMPOSSIBLE (pattern interrupt, shocking claim, mystery)
- Every paragraph must either reveal new information, shift the tone, or build tension — never all three at once, never none of them
- End with a punch, an open question, or a pivot — never a recap
- Write like you're telling a secret to a friend who's about to interrupt you, not giving a lecture
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
` : ""}${beatSheetBlock ? `\nEXECUTE THE BEAT SHEET BELOW. Each beat is a movement, not a paragraph — give big beats more room, small beats less. The reversal beat must actually overturn an expectation set up earlier in the prose. Do not skip beats; do not invent new ones.${beatSheetBlock}` : ""}${researchBlock}`;

  const userPrompt = `Write the story for this idea: ${topicIdea}. The intended visual style is ${style}. Execute the beat sheet if provided. Make it impossible to stop reading — and impossible to predict.`;

  return generateText(systemPrompt, userPrompt, { model: primaryModel, temperature: 0.85, seed });
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

  const { text } = await recordAiCall(
    {
      provider: "openrouter",
      model: primaryModel,
      operation: "llm.refineStory",
      request: { system: systemPrompt, messages, temperature: 0.7 },
      summarize: (r) => ({ length: (r as { text?: string }).text?.length ?? 0 }),
    },
    () =>
      aiGenerateText({
        model: openrouter.chat(primaryModel),
        system: systemPrompt,
        messages,
        temperature: 0.7,
      }),
  );

  return text;
}
