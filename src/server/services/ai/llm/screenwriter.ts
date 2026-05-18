import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { buildStoryAssetVisionContentParts } from "@/server/services/story-asset-tools";
import { openrouter, type StoryAsset } from "./index";
import type {
  BeatSheet,
  CreativeBrief,
  ResearchPackWithClaims,
  Screenplay,
} from "@/types/pipeline";
import { formatResearchEvidence } from "./research-evidence";
import { formatBeatSheetForPrompt } from "./beat-sheet";
import { recordAiCall } from "@/server/services/ai-audit";

// ── Screenwriter Agent (movie video type) ──

const sceneFunctionEnum = z.enum([
  "setup",
  "escalate",
  "reveal",
  "reversal",
  "quiet-beat",
  "climax",
  "resolve",
]);

const voicePaceEnum = z.enum(["slow", "standard", "fast"]);

const emotionEnum = z.enum([
  "neutral",
  "joyful",
  "sad",
  "angry",
  "fearful",
  "tender",
  "tense",
  "triumphant",
  "playful",
  "cold",
]);

const emotionIntensityEnum = z.enum(["subtle", "moderate", "strong"]);

const screenplaySceneSchema = z.object({
  sceneTitle: z.string().describe("Short slug for this beat (2-5 words), like a scene heading."),
  speaker: z
    .string()
    .describe(
      "Who delivers this scene's audio: the EXACT consistent character name when a character speaks, or 'Narrator' for a narration/voiceover beat. Establish a short name the first time a character appears and reuse it verbatim."
    ),
  line: z
    .string()
    .describe(
      "Exactly what the viewer HEARS in this scene — a character's spoken line, or the narrator's sentence(s). This is the audio. You MAY insert at most one `[pause:N]` marker (N seconds 0.3–1.5) at a dramatic beat."
    ),
  action: z
    .string()
    .describe(
      "The concrete on-screen staging the viewer SEES while the line plays — blocking, gesture, physical event. Photographable only; no camera/lens jargon. If the line is dialogue, this is what the character/scene is physically doing as they speak."
    ),
  sceneFunction: sceneFunctionEnum.describe(
    "Dramatic function: 'setup', 'escalate', 'reveal', 'reversal', 'quiet-beat', 'climax', 'resolve'. The sequence MUST vary — never two identical functions in a row."
  ),
  voicePace: voicePaceEnum.describe(
    "Delivery pace for this line: 'slow' (~100 wpm — weighty/somber), 'standard' (~150 wpm), 'fast' (~180 wpm — urgent). Vary it."
  ),
  emotion: emotionEnum.describe(
    "The emotion the speaker FEELS as they deliver this exact line — match it to the sense of the words and the character's state in this moment. Vary it across the film; do not default to 'neutral' for lines that carry feeling."
  ),
  emotionIntensity: emotionIntensityEnum.describe(
    "How hard the emotion is played: 'subtle' (held back, under the surface), 'moderate', or 'strong' (full force — a shout, a sob, a roar of triumph)."
  ),
  directorNote: z
    .string()
    .describe(
      "RICH visual brief for the cinematography pipeline (English, no word limit). SETTING (location, era, time, weather, materials), SUBJECTS (consistent names, wardrobe, posture, expression), the single physical ACTION, MOOD via physical elements only, and one concrete visual symbol if apt. Write as if briefing a $100M-film cinematographer."
    ),
});

const screenplaySchema = z.object({
  title: z.string().describe("SEO-friendly, emotionally compelling film title."),
  logline: z.string().describe("One-sentence logline capturing the dramatic spine."),
  scenes: z.array(screenplaySceneSchema),
});

export interface GenerateScreenplayInput {
  style: string;
  topicIdea: string;
  language?: string;
  model?: string;
  brief?: CreativeBrief;
  researchPack?: ResearchPackWithClaims | null;
  beatSheet?: BeatSheet;
  assets?: StoryAsset[];
  seed?: number;
}

export async function generateScreenplay(
  input: GenerateScreenplayInput
): Promise<Screenplay> {
  const {
    style,
    topicIdea,
    language = "en",
    model,
    brief,
    researchPack,
    beatSheet,
    assets,
    seed,
  } = input;

  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);
  const researchBlock = researchPack?.claims?.length
    ? `\n\n${formatResearchEvidence(researchPack)}`
    : "";
  const beatSheetBlock = beatSheet ? `\n\n${formatBeatSheetForPrompt(beatSheet)}` : "";

  const briefBlock = brief
    ? `
CREATIVE BRIEF (follow these constraints):
- Concept: ${brief.concept}
- Tone: ${brief.tone}
- Narrative arc: ${brief.narrativeArc}
- Target audience: ${brief.targetAudience}
- Word budget for ALL spoken lines combined: ~${brief.durationGuidance.wordBudgetTarget} words (range ${brief.durationGuidance.wordBudgetMin}–${brief.durationGuidance.wordBudgetMax})
- Scene count: ${brief.durationGuidance.sceneBudget.min}–${brief.durationGuidance.sceneBudget.max} scenes
- Max sentences per scene line: ${brief.formatConstraints.maxSentencesPerScene}
- Narration-style / dialogue-density leanings from the brief (${brief.formatConstraints.narrationStyle} / ${brief.formatConstraints.dialogueDensity}): IGNORE these for pacing the talk balance. This is a movie — it is dialogue-driven regardless of what the brief leans. Use the brief only for tone/arc/audience, not to justify narration.
- Opening hook: ${brief.formatConstraints.openingHook}
- Resolution: ${brief.formatConstraints.resolutionType}${brief.narrativeFramework && brief.narrativeFramework !== "freeform" ? `
- Narrative framework: ${brief.narrativeFramework} — honor the beat-sheet structure built against it.` : ""}`
    : "";

  const assetSys =
    assets && assets.length > 0
      ? `\n\nCAST & WORLD: Reference images and descriptions are attached. Write these named characters/locations into the screenplay using their EXACT names; match their depicted look. You may also introduce new characters the story needs.`
      : "";

  const systemPrompt = `You are an award-winning SCREENWRITER writing a DIALOGUE-DRIVEN cinematic short film — a movie where characters talk to each other and the drama plays out between them. This is NOT a narrated essay, NOT a trailer voiceover, NOT voiceover storytelling with occasional quotes. Think real cinema: scenes, characters, conversations.

OUTPUT MODEL (critical):
- The film is an ordered list of SCENES. Each scene is ONE moment the audience experiences.
- Every scene has audio: either a CHARACTER speaks one line (speaker = that character's consistent name) OR — rarely — it is a NARRATION beat (speaker = "Narrator").
- DIALOGUE IS THE DEFAULT AND DOMINANT MODE. The film should be carried by characters speaking — to each other, in real exchanges (one scene = one line, so a back-and-forth is several consecutive scenes with alternating speakers). Conversations, confrontations, and quiet two-handers ARE the movie.
- NARRATION IS A RARE EXCEPTION. Use a "Narrator" scene ONLY when something essential genuinely cannot be dramatized through dialogue or action — a hard time jump, an opening/closing card, context impossible to show or speak. Aim for zero narration; never let it exceed ~1 in 5 scenes, and never use it to explain what dialogue or the image already conveys. If you're tempted to narrate, first try: can a character SAY this, or can we SEE it instead? Almost always, yes.
- A silent cast is a failure. If named characters exist and the concept can possibly be dramatized (it almost always can), they must talk. An all-narration or narration-heavy result is wrong for this format.
- One action per scene. If a moment contains a glance, a turn, and a reply, that is three scenes.

WRITING CRAFT (non-negotiable):
- Subtext over exposition. Characters talk AROUND the feeling, not about it. BANNED: thesis-statement / greeting-card lines that name the theme out loud (e.g. "Our rivalry was really a partnership", "Respect made us believers"). Say it sideways — through a small concrete request, a deflection, an unfinished sentence.
- Real speech: contractions, interruptions, subtext, characters who don't fully answer each other. No speeches, no narrator-style lines coming out of a character's mouth.
- At least one REVERSAL: set an expectation early, break it mid-to-late. If the beat sheet marks a REVERSAL beat, land it there.
- Vary the dramatic function across scenes — forbidden: two consecutive scenes with the same sceneFunction. Include at least one 'quiet-beat' before a high-stakes scene and at least one 'reversal' or 'reveal'.
- Distinct character voices: each character has their own diction, rhythm, and stance — distinguishable without the speaker label.
- EMOTIONAL PERFORMANCE: every line is ACTED, not read. Set emotion + emotionIntensity to the true feeling under the words (a threat is 'cold' or 'angry', a goodbye is 'sad' or 'tender', a winning roar is 'triumphant' 'strong'). The emotion should shift scene to scene with the drama — a film delivered in one flat tone is a failure.
- Escalating specificity: each scene reveals a concrete new thing (a name, an object, a turn) — never just "things intensify".
- 'action' must be physically photographable — bodies, objects, weather, light. No abstractions, no camera/lens terminology (that lives in directorNote).

CONSISTENCY:
- Establish a SHORT name for every character and key location the first time they appear; reuse it EXACTLY everywhere (speaker, line, action, directorNote). Never rename or use synonyms.
- A character's appearance is fixed once established; only the story (a transformation, time jump, disguise) may change it.
${briefBlock}${assetSys}
LANGUAGE RULES:
- sceneTitle and line MUST be written in ${langName}.
- speaker, action, and directorNote MUST be in English (for downstream AI model compatibility). Keep the speaker name identical across the whole screenplay.
${beatSheetBlock ? `
EXECUTE THE BEAT SHEET. Each beat is a movement — give big beats more scenes, small beats fewer. Do not skip or invent beats.${beatSheetBlock}` : ""}${researchBlock}`;

  const userPrompt = `Write the screenplay for this film idea: ${topicIdea}\n\nThe intended visual style/medium is: ${style}. This is a movie: the characters carry it by talking to each other. Write real scenes and exchanges, with subtext — not a voiceover with quotes. Use narration only if something truly cannot be dramatized.`;

  const visionParts =
    assets && assets.length > 0 ? await buildStoryAssetVisionContentParts(assets) : [];

  const run = async (systemSuffix: string): Promise<Screenplay | undefined> => {
    const system = systemPrompt + systemSuffix;
    const { output } = await recordAiCall(
      {
        provider: "openrouter",
        model: primaryModel,
        operation: "llm.generateScreenplay",
        request: {
          system,
          userPrompt,
          visionParts,
          temperature: 0.85,
          seed,
          schema: "screenplaySchema",
        },
        summarize: (r) => ({
          sceneCount:
            (r as { output?: { scenes?: unknown[] } }).output?.scenes?.length ?? 0,
        }),
      },
      () =>
        aiGenerateText({
          model: openrouter.chat(primaryModel),
          output: Output.object({ schema: screenplaySchema }),
          system,
          messages: [
            {
              role: "user",
              content: [...visionParts, { type: "text", text: userPrompt }],
            },
          ],
          temperature: 0.85,
          ...(seed !== undefined && { seed }),
        }),
    );
    return output;
  };

  let screenplay = await run("");
  if (!screenplay) throw new Error("Failed to generate screenplay");

  // Safety net: a movie must be dialogue-driven. If the draft is narration-
  // heavy (less than half the scenes are character speech), regenerate once
  // with a hard mandate to make it a real talking film.
  if (isNarrationHeavy(screenplay)) {
    console.warn(
      "[screenwriter] Draft is narration-heavy (movies must be dialogue-driven) — regenerating once with a dialogue mandate."
    );
    const retried = await run(`

REVISION MANDATE (your previous draft failed): it leaned on narration instead of letting the characters talk. A movie is dialogue-driven. Rewrite so the film is carried by characters speaking to each other in real exchanges (alternating speaker scenes), with subtext and no thesis-statement lines. Use a "Narrator" scene ONLY where something truly cannot be dramatized — aim for zero, never more than ~1 in 5 scenes. The confrontation, turning point, climax, and resolution MUST be spoken character dialogue.`);
    if (retried && !isNarrationHeavy(retried)) screenplay = retried;
  }

  return screenplay;
}

/** True when a multi-scene movie isn't dialogue-driven (>=half is narration). */
function isNarrationHeavy(s: Screenplay): boolean {
  if (s.scenes.length < 2) return false;
  const characterScenes = s.scenes.filter(
    (sc) => (sc.speaker?.trim().toLowerCase() || "narrator") !== "narrator"
  ).length;
  return characterScenes / s.scenes.length < 0.5;
}

/**
 * Render a structured screenplay to human-readable markdown for storage in
 * `videoProjects.script` (review UI, title extraction, and refinement all read
 * this text). MUST start with `# Title` so the title regex keeps working.
 */
export function renderScreenplayMarkdown(screenplay: Screenplay): string {
  const lines: string[] = [`# ${screenplay.title}`, ""];
  if (screenplay.logline) lines.push(`_${screenplay.logline}_`, "");
  screenplay.scenes.forEach((s, i) => {
    lines.push(`## Scene ${i + 1} — ${s.sceneTitle}`);
    const who = s.speaker?.trim() || "Narrator";
    lines.push(`**${who.toUpperCase()}:** ${s.line}`);
    if (s.action?.trim()) lines.push("", `_${s.action.trim()}_`);
    lines.push("");
  });
  return lines.join("\n").trim();
}
