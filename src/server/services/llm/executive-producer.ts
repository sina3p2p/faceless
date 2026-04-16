import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter, type StoryAsset } from "./index";
import type { CreativeBrief, DurationPreference } from "@/lib/types";

const WORDS_PER_SECOND = 2.5;

const formatConstraintsSchema = z.object({
  narrationStyle: z.enum(["voiceover", "dialogue", "mixed"]),
  openingHook: z.enum(["question", "claim", "mystery", "action"]),
  revealTiming: z.enum(["early", "gradual", "final"]),
  resolutionType: z.enum(["closed", "open", "cliffhanger"]),
  dialogueDensity: z.enum(["none", "sparse", "moderate", "heavy"]),
  maxSentencesPerScene: z.number(),
});

const creativeBriefSchema = z.object({
  concept: z.string().describe("One-line elevator pitch for the video"),
  tone: z.string().describe("Emotional register: 'darkly comedic', 'whimsical and warm', 'tense and foreboding'"),
  targetAudience: z.string().describe("Who this video is for — age, interests, platform behavior"),
  pacingStrategy: z.string().describe("How the video should feel temporally: 'slow burn', 'rapid-fire cuts', 'steady escalation'"),
  visualMood: z.string().describe("The emotional quality of the visuals: 'desaturated gritty realism', 'vibrant pop art'"),
  narrativeArc: z.string().describe("The shape of the story: 'mystery reveal', 'hero journey', 'countdown', 'parallel stories'"),
  durationGuidance: z.object({
    wordBudgetMin: z.number().describe("Minimum word count for full narration"),
    wordBudgetTarget: z.number().describe("Target word count for full narration"),
    wordBudgetMax: z.number().describe("Maximum word count for full narration"),
    sceneBudget: z.object({
      min: z.number().describe("Minimum number of scenes"),
      max: z.number().describe("Maximum number of scenes"),
    }),
  }),
  formatConstraints: formatConstraintsSchema,
});

export async function generateCreativeBrief(
  style: string,
  videoType: string,
  language: string,
  duration: DurationPreference,
  topicIdea: string | undefined,
  assets: StoryAsset[],
  model?: string
): Promise<CreativeBrief> {
  const primaryModel = model || LLM.producerModel;
  const langName = getLanguageName(language);

  const wordBudgetMin = Math.round(duration.min * WORDS_PER_SECOND);
  const wordBudgetTarget = Math.round(duration.preferred * WORDS_PER_SECOND);
  const wordBudgetMax = Math.round(duration.max * WORDS_PER_SECOND);

  const sceneBudgetMin = Math.max(2, Math.floor(duration.min / 10));
  const sceneBudgetMax = Math.ceil(duration.max / 5);

  const assetSummary = assets.length > 0
    ? `\nAvailable assets: ${assets.map((a) => `${a.name} (${a.type})`).join(", ")}`
    : "";

  const systemPrompt = `You are an Executive Producer planning a short-form video production.

Your job is to create a CREATIVE BRIEF that all downstream agents (writer, director, cinematographer, etc.) will follow. Every decision you make here constrains what they can do.

PRODUCTION PARAMETERS:
- Visual style: ${style}
- Video type: ${videoType}
- Language: ${langName}
- Duration target: ${duration.preferred}s (acceptable range: ${duration.min}s–${duration.max}s)
- Duration priority: ${duration.priority === "quality" ? "Quality over exact timing — let the story breathe" : "Hit the target duration — trim to fit"}
${assetSummary}

DURATION MATH (pre-calculated — use these values):
- Word budget: ${wordBudgetMin}–${wordBudgetMax} words (target: ${wordBudgetTarget})
- Scene budget: ${sceneBudgetMin}–${sceneBudgetMax} scenes

FORMAT CONSTRAINTS — you must decide:
1. narrationStyle: "voiceover" (narrator tells story), "dialogue" (characters speak), or "mixed"
2. openingHook: "question" (provocative question), "claim" (bold statement), "mystery" (withhold key info), "action" (start mid-action)
3. revealTiming: "early" (answer comes fast, rest is exploration), "gradual" (pieces revealed throughout), "final" (big reveal at end)
4. resolutionType: "closed" (complete ending), "open" (ambiguous), "cliffhanger" (unresolved tension)
5. dialogueDensity: "none", "sparse" (occasional quotes), "moderate" (regular dialogue), "heavy" (mostly conversation)
6. maxSentencesPerScene: how many narration sentences fit one scene (typically 1–4 for short-form)

Choose these based on the video type, and duration. A 15s video needs different constraints than a 120s video.${topicIdea ? `\n\nTOPIC DIRECTION: ${topicIdea}` : ""}`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: creativeBriefSchema }),
    system: systemPrompt,
    prompt: "Create the creative brief for this production.",
    temperature: 0.8,
  });
  if (!output) throw new Error("Failed to generate creative brief");

  return output;
}
