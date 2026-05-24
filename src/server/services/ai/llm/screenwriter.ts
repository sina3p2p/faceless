import { Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { buildStoryAssetVisionContentParts } from "@/server/services/story-asset-tools";
import { openrouter, type StoryAsset } from "./index";
import {
  EMOTIONS,
  type BeatSheet,
  type CreativeBrief,
  type ResearchPackWithClaims,
  type Screenplay,
} from "@/types/pipeline";
import { formatResearchEvidence } from "./research-evidence";
import { formatBeatSheetForPrompt } from "./beat-sheet";
import { generateText } from "@/server/services/ai-audit";

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

const emotionEnum = z.enum(EMOTIONS);

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
      "The concrete on-screen staging the viewer SEES while the line plays — blocking, gesture, physical event. English only. Photographable only; no camera/lens jargon."
    ),
  sceneFunction: sceneFunctionEnum.describe(
    "Dramatic function: 'setup', 'escalate', 'reveal', 'reversal', 'quiet-beat', 'climax', 'resolve'. The sequence MUST vary — never two identical functions in a row."
  ),
  voicePace: voicePaceEnum.describe(
    "Delivery pace for this line: 'slow' (~100 wpm — weighty/somber), 'standard' (~150 wpm), 'fast' (~180 wpm — urgent). Vary it."
  ),
  emotion: emotionEnum.describe(
    "The emotion the speaker FEELS as they deliver this exact line. Vary it across the film; do not default to 'neutral' for lines that carry feeling."
  ),
  emotionIntensity: emotionIntensityEnum.describe(
    "How hard the emotion is played: 'subtle' (held back), 'moderate', or 'strong' (full force)."
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
  model: string;
  brief?: CreativeBrief;
  researchPack?: ResearchPackWithClaims | null;
  beatSheet?: BeatSheet;
  assets?: StoryAsset[];
  seed?: number;
}

// ── Pass 1: Prose screenwriter ──
// Writes the film as a flowing prose screenplay — no schema pressure.
// The model focuses entirely on storytelling: dialogue subtext, character
// voice, pacing, and dramatic arc.

async function writeScreenplayProse(
  input: GenerateScreenplayInput,
  retryMandate?: string
): Promise<string> {
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
  const langName = getLanguageName(language);
  const researchBlock = researchPack?.claims?.length
    ? `\n\n${formatResearchEvidence(researchPack)}`
    : "";
  const beatSheetBlock = beatSheet ? `\n\n${formatBeatSheetForPrompt(beatSheet)}` : "";

  const briefBlock = brief
    ? `
CREATIVE BRIEF:
- Concept: ${brief.concept}
- Tone: ${brief.tone}
- Narrative arc: ${brief.narrativeArc}
- Target audience: ${brief.targetAudience}
- Word budget for ALL spoken lines combined: ~${brief.durationGuidance.wordBudgetTarget} words (range ${brief.durationGuidance.wordBudgetMin}–${brief.durationGuidance.wordBudgetMax})
- Scene count: ${brief.durationGuidance.sceneBudget.min}–${brief.durationGuidance.sceneBudget.max} scenes
- Max sentences per line: ${brief.formatConstraints.maxSentencesPerScene}
- Opening hook: ${brief.formatConstraints.openingHook}
- Resolution: ${brief.formatConstraints.resolutionType}${brief.narrativeFramework && brief.narrativeFramework !== "freeform" ? `
- Narrative framework: ${brief.narrativeFramework}` : ""}`
    : "";

  const assetNote =
    assets && assets.length > 0
      ? `\n\nCAST & WORLD: Reference images and descriptions are attached. Write these named characters/locations into the screenplay using their EXACT names; match their depicted look.`
      : "";

  const systemPrompt = `You are an award-winning screenwriter writing a DIALOGUE-DRIVEN short cinematic film. Your only job right now is to write the best possible screenplay — no formatting constraints, no structured fields, just great writing.

FORMAT: Write in standard screenplay format.
- Scene headings: INT./EXT. LOCATION - TIME OF DAY
- Action lines: short, physical, what a camera sees — no internal thoughts, no abstractions
- Character names in ALL CAPS above their dialogue
- Parentheticals for delivery only: (quietly), (through tears), (cold), never over-explain
- Leave a blank line between every element

CRAFT (non-negotiable):
- DIALOGUE IS THE DRAMA. Characters carry the film by talking to each other. Every confrontation, turning point, and climax must be spoken. A silent or narrated film is a failure.
- Subtext over exposition. Characters talk AROUND the feeling. BANNED: thesis-statement lines that name the theme ("Our rivalry was really friendship all along."). Say it sideways — through a small request, a deflection, an object handed over.
- Real speech: contractions, half-finished sentences, characters who don't fully answer. No speeches.
- Distinct voices: each character has their own diction, rhythm, and stance — recognizable without the name above.
- AT LEAST ONE REVERSAL: overturn an expectation set up earlier. Place it mid-to-late.
- Vary dramatic weight — include one slow, quiet beat before the high-stakes climax.
- Every action line must be physically photographable. No camera directions, no lens jargon.

NARRATION (V.O.):
- Use "NARRATOR (V.O.)" only when something genuinely cannot be dramatized through dialogue or action.
- A hard time jump or a closing card is acceptable. Explaining emotion is not.
- Target: zero narration. Never more than roughly 1 in 5 scenes.

LANGUAGE:
- Dialogue and scene titles: write in ${langName}.
- Action lines and scene headings: write in English.
${briefBlock}${assetNote}${beatSheetBlock ? `

EXECUTE THE BEAT SHEET — every beat must land in the screenplay. Big beats get more scenes; small beats fewer. Do not skip or invent beats.${beatSheetBlock}` : ""}${researchBlock}${retryMandate ? `\n\n${retryMandate}` : ""}`;

  const visionParts =
    assets && assets.length > 0 ? await buildStoryAssetVisionContentParts(assets) : [];

  const { text } = await generateText({
    model: openrouter.chat(model),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          ...visionParts,
          {
            type: "text",
            text: `Write the screenplay for this film: ${topicIdea}\n\nVisual style/medium: ${style}\n\nWrite the complete screenplay now. Characters must talk to each other — real exchanges with subtext.`,
          },
        ],
      },
    ],
    temperature: 0.9,
    ...(seed !== undefined && { seed }),
  });

  return text;
}

// ── Pass 2: Structured extractor ──
// Reads the prose screenplay and extracts it into the typed Screenplay schema.
// No creative decisions — purely analytical: segment, label, expand directorNote.

async function structureScreenplayFromProse(
  prose: string,
  model: string,
  language = "en"
): Promise<Screenplay | undefined> {
  const langName = getLanguageName(language);

  const systemPrompt = `You are a script editor. Given a prose screenplay, extract it into a structured scene list. Your job is purely analytical — do not rewrite or improve the dialogue, just segment and tag it accurately.

SEGMENTATION RULE:
- Each spoken moment = ONE scene. One character speech in the prose = one scene, even if it's short.
- A back-and-forth exchange (A speaks, B speaks, A speaks) = three consecutive scenes with alternating speakers.
- If a character speaks multiple sentences in one unbroken speech, that is still ONE scene.
- NARRATOR (V.O.) lines = scenes with speaker "Narrator".

PER-SCENE FIELDS:
- speaker: the character's name exactly as written in the prose (consistent, English). "Narrator" for V.O.
- line: the exact spoken dialogue, preserved verbatim (keep the original ${langName} language).
- action: the physical staging around this line — drawn from nearby action lines in the prose. English only. What the camera sees; no abstractions.
- emotion: true feeling under the delivery — choose from: ${EMOTIONS.join(", ")}. Match the sense of the words and the character's state. Never default to "neutral" for a line that carries feeling.
- emotionIntensity: "subtle" | "moderate" | "strong"
- sceneFunction: dramatic role — "setup" | "escalate" | "reveal" | "reversal" | "quiet-beat" | "climax" | "resolve". Infer from position in the arc and the stakes of the moment. Never assign the same function to two consecutive scenes.
- voicePace: "slow" | "standard" | "fast" — match the delivery weight of the line.
- sceneTitle: 2-5 word slug for this moment (in ${langName}).
- directorNote: RICH visual brief for the cinematography pipeline — ALWAYS in English. Expand from the action lines and scene heading in the prose. Include: SETTING (exact location, time of day, weather, materials, era), SUBJECTS (consistent names, wardrobe, posture, expression), the single physical ACTION, MOOD via physical elements only (light, weather, posture — not abstract feelings), and one concrete visual symbol if present. Write as if briefing a $100M-film cinematographer. This field may be longer than the prose action line — add visual specificity that serves the scene.

CONSISTENCY:
- Use one short canonical name for each character, consistent across all scenes.
- A character's appearance (clothing, hair, physical features) is fixed once established — carry it through every directorNote they appear in.`;

  const { output } = await generateText({
    model: openrouter.chat(model),
    output: Output.object({ schema: screenplaySchema }),
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract this screenplay into structured scenes:\n\n${prose}`,
          },
        ],
      },
    ],
    temperature: 0.3,
  });

  return output;
}

export async function generateScreenplay(
  input: GenerateScreenplayInput
): Promise<Screenplay> {
  // Pass 1: write as free-flowing prose screenplay
  const prose = await writeScreenplayProse(input);
  console.log(
    `[screenwriter] Prose pass complete (~${prose.split(/\s+/).length} words, ~${prose.split("\n").length} lines)`
  );

  // Pass 2: extract structured scenes from the prose
  let screenplay = await structureScreenplayFromProse(prose, input.model, input.language);
  if (!screenplay) throw new Error("Failed to structure screenplay from prose");

  // Safety net: a movie must be dialogue-driven. If the prose writer drifted
  // toward narration, regenerate the prose with a hard dialogue mandate and
  // re-extract. The fix targets the prose (root cause), not the structured output.
  if (isNarrationHeavy(screenplay)) {
    console.warn(
      "[screenwriter] Draft is narration-heavy — regenerating prose with dialogue mandate."
    );
    const prose2 = await writeScreenplayProse(
      input,
      `REVISION MANDATE (your previous draft failed): it leaned on narration (NARRATOR V.O.) instead of letting the characters talk. Rewrite so the film is carried by characters speaking to each other in real exchanges. Use NARRATOR (V.O.) ONLY where something truly cannot be dramatized — aim for zero, never more than 1 in 5 scenes. The confrontation, turning point, climax, and resolution MUST be spoken character dialogue with subtext.`
    );
    const retried = await structureScreenplayFromProse(prose2, input.model, input.language);
    if (retried && !isNarrationHeavy(retried)) screenplay = retried;
  }

  console.log(
    `[screenwriter] Screenplay ready: "${screenplay.title}" (${screenplay.scenes.length} scenes)`
  );
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
