import { generateText, Output } from "ai";
import { recordAiCall } from "@/server/services/ai-audit";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { buildStoryAssetVisionContentParts } from "@/server/services/story-asset-tools";
import { openrouter, type StoryAsset } from "./index";
import type { CreativeBrief, DurationPreference } from "@/types/pipeline";
import { WORDS_PER_SECOND } from "./pacing";

const formatConstraintsSchema = z.object({
  narrationStyle: z.enum(["voiceover", "dialogue", "mixed"]),
  openingHook: z.enum(["question", "claim", "mystery", "action"]),
  revealTiming: z.enum(["early", "gradual", "final"]),
  resolutionType: z.enum(["closed", "open", "cliffhanger"]),
  dialogueDensity: z.enum(["none", "sparse", "moderate", "heavy"]),
  maxSentencesPerScene: z.number(),
});

const audienceSegmentSchema = z.object({
  segment: z.string().describe("Micro-segment, not a demographic bucket. E.g. 'indie devs, 25-34, evening hobbyists, anxious about shipping' — not 'young adults interested in tech'."),
  primaryGoal: z.string().describe("The single most important outcome this viewer is trying to achieve. One short phrase."),
  primaryFear: z.string().describe("The single most important fear / pain point this viewer carries. One short phrase."),
  emotionalTriggers: z.array(z.string()).describe("2-4 short emotional triggers this micro-segment responds to. Each <= 6 words."),
  trustSignals: z.array(z.string()).describe("1-3 concrete signals that earn this segment's trust (e.g. 'real customer quotes', 'verified data source', 'on-screen receipts')."),
  toneToAvoid: z.string().describe("Explicit anti-tone — what would make this segment bounce. E.g. 'corporate jargon', 'preachy moralizing', 'gen-z slang'."),
});

const cinematicSpecSchema = z.object({
  lightingStyle: z.string().describe("Explicit lighting setup using cinematography vocabulary: e.g. 'Rembrandt key + negative fill', 'butterfly key with rim', 'practical sources only'. No subjective adjectives ('dramatic', 'cool')."),
  colorTemperatureK: z.number().describe("White balance in Kelvin. Anchors: 3000K=golden hour, 4300K=overcast, 5600K=daylight, 7500K=cool/moonlit. Integer."),
  lensFocalMm: z.number().describe("Lens focal length in mm. Common picks: 24 (wide), 35 (environmental), 50 (natural), 85 (portrait/intimate), 135 (compressed). Integer."),
  depthOfField: z.enum(["deep", "shallow", "anamorphic-bokeh"]).describe("'deep' = everything in focus; 'shallow' = subject isolated; 'anamorphic-bokeh' = oval bokeh + shallow plane."),
  cameraMovement: z.string().describe("Concrete movement vocabulary: 'locked-off', 'slow push-in', 'low-angle dolly', 'handheld follow', 'crane reveal'. No mood words."),
  aspectMood: z.string().describe("One or two words describing the technical look the cinematographer must lock in: 'gritty', 'polished', 'high-contrast', 'pastel-flat'."),
});

const narrativeFrameworkEnum = z.enum(["AIDA", "PAS", "heros-journey", "freeform"]);

const creativeBriefSchema = z.object({
  concept: z.string().describe("One-line elevator pitch for the video"),
  tone: z.string().describe("Emotional register: 'darkly comedic', 'whimsical and warm', 'tense and foreboding'"),
  targetAudience: z.string().describe("One-line human-readable summary of `audience.segment` for logs and UI"),
  audience: audienceSegmentSchema.describe("Structured micro-segment definition. Downstream writers read this — not `targetAudience`."),
  pacingStrategy: z.string().describe("How the video should feel temporally: 'slow burn', 'rapid-fire cuts', 'steady escalation'"),
  visualMood: z.string().describe("The emotional quality of the visuals: 'desaturated gritty realism', 'vibrant pop art'"),
  narrativeArc: z.string().describe("The shape of the story: 'mystery reveal', 'hero journey', 'countdown', 'parallel stories'"),
  narrativeFramework: narrativeFrameworkEnum.describe("Structural blueprint the beat sheet and story writer MUST follow. Use 'freeform' only with a justification embedded in narrativeArc."),
  cinematicSpec: cinematicSpecSchema.describe("Deterministic camera/lighting parameters that lock aesthetic consistency across all scenes. The cinematographer prepends these to every per-scene prompt."),
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

  const systemPrompt = `You are an Executive Producer planning a short-form video production.

Your job is to create a CREATIVE BRIEF that all downstream agents (writer, director, cinematographer, etc.) will follow. Every decision you make here constrains what they can do.

PRODUCTION PARAMETERS:
- Visual style: ${style}
- Video type: ${videoType}
- Language: ${langName}
- Duration target: ${duration.preferred}s (acceptable range: ${duration.min}s–${duration.max}s)
- Duration priority: ${duration.priority === "quality" ? "Quality over exact timing — let the story breathe" : "Hit the target duration — trim to fit"}

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
${videoType === "movie" ? `
MOVIE TYPE: This is a cinematic short film. Dialogue is OPTIONAL — decide narrationStyle and dialogueDensity purely from what THIS story needs. A movie can be pure voiceover, mixed, or dialogue-driven; do not force heavy dialogue, and do not avoid it when the story genuinely calls for characters to speak.
` : ""}
Choose these based on the video type and duration. Use this concrete guidance for the chosen target duration (${duration.preferred}s) — these are starting points, override only with reason:
${
  duration.preferred <= 30
    ? `- SHORT FORM (≤30s): maxSentencesPerScene=1, openingHook='claim' or 'mystery' (no time for slow burns), revealTiming='early' or 'final' (gradual won't fit), resolutionType='closed' or 'cliffhanger', dialogueDensity='none' or 'sparse'. Pacing: rapid-fire, every second earns its keep.`
    : duration.preferred <= 90
      ? `- MID FORM (30–90s): maxSentencesPerScene=2–3, any openingHook works, revealTiming='gradual' fits well, dialogueDensity up to 'moderate'. Pacing: room for one quiet beat before the climax.`
      : `- LONG FORM (>90s): maxSentencesPerScene=3–4, revealTiming='gradual' or 'early' (audience needs payoff signposts), dialogueDensity up to 'heavy'. Pacing: steady escalation with multiple breath beats.`
}

AUDIENCE (structured micro-segment — not a demographic bucket):
- Move from "young adults interested in tech" → "indie devs, 25–34, evening hobbyists, anxious about shipping".
- Pick ONE primaryGoal and ONE primaryFear — the sharpest, most specific you can defend. Vague goals like "be successful" are forbidden.
- 2–4 emotionalTriggers, each <= 6 words and concrete (e.g. "fear of falling behind peers", "FOMO on the new tool").
- 1–3 trustSignals — the kinds of evidence this segment trusts (e.g. "verified data source", "on-screen receipts", "named expert").
- toneToAvoid: name a real anti-tone the segment would reject. Never leave this blank.
- targetAudience is a one-line human-readable summary of audience.segment for logs; the structured object is the source of truth.

NARRATIVE FRAMEWORK (closed enum — pick one):
- "AIDA" (Attention → Interest → Desire → Action): story-driven, aspirational, brand-awareness. Best for mid-form (30–90s) and brand spots.
- "PAS" (Problem → Agitation → Solution): direct-response, educational, product features. Best for short-form (≤30s) and explainers.
- "heros-journey" (Challenge → Mentor/Tool → Victory): long-form (>90s) narratives only.
- "freeform": only allowed when none of the above fits. If you pick freeform, the narrativeArc field MUST contain a one-line justification.

For the chosen target duration (${duration.preferred}s), default preference: ${
  duration.preferred <= 30
    ? `PAS (or AIDA for brand spots).`
    : duration.preferred <= 90
      ? `AIDA or PAS depending on intent (story vs direct-response).`
      : `heros-journey allowed; AIDA also acceptable.`
}

CINEMATIC SPEC (AI Director of Photography — deterministic, no subjective adjectives):
- lightingStyle: pick from cinematography vocabulary. Examples: "Rembrandt key + negative fill" (intimate/dramatic), "butterfly key with rim" (beauty/portrait), "high-key soft" (commercial/clean), "low-key directional" (noir/tension), "practical sources only" (vérité/grounded). Do not write "moody" or "dramatic" here — write the setup that PRODUCES that mood.
- colorTemperatureK (Kelvin integer): 3000=golden hour / candlelight; 4300=overcast; 5600=daylight; 7500=cool/moonlit. Pick ONE anchor.
- lensFocalMm (integer): 24=wide environmental; 35=natural environmental; 50=natural; 85=portrait/intimate; 135=compressed/voyeuristic.
- depthOfField: "deep" (everything sharp — wide/landscape), "shallow" (subject isolated — portrait/intimate), "anamorphic-bokeh" (oval bokeh, cinematic).
- cameraMovement: concrete physical movement: "locked-off", "slow push-in", "low-angle dolly", "handheld follow", "crane reveal", "static then whip-pan". Forbidden: "dramatic camera", "energetic motion".
- aspectMood: one or two words for the technical look — "gritty", "polished", "high-contrast", "pastel-flat", "filmic-grainy".
- visualMood (the existing field) remains the narrative-emotional descriptor; cinematicSpec is the deterministic technical layer that the cinematographer will lock across every scene.${topicIdea ? `\n\nTOPIC DIRECTION: ${topicIdea}` : ""}`;

  const visionParts = await buildStoryAssetVisionContentParts(assets);
  const { output } = await recordAiCall(
    {
      provider: "openrouter",
      model: primaryModel,
      operation: "llm.generateCreativeBrief",
      request: { system: systemPrompt, visionParts, temperature: 0.8, schema: "creativeBriefSchema" },
    },
    () =>
      generateText({
        model: openrouter.chat(primaryModel),
        output: Output.object({ schema: creativeBriefSchema }),
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              ...visionParts,
              { type: "text", text: "Create the creative brief for this production." },
            ],
          },
        ],
        temperature: 0.8,
      }),
  );
  if (!output) throw new Error("Failed to generate creative brief");

  return output;
}
