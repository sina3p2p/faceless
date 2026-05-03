import { generateText, Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter } from "./index";
import type {
  BeatSheet,
  CreativeBrief,
  ResearchPackWithClaims,
} from "@/types/pipeline";
import { formatResearchEvidence } from "./research-evidence";

const beatSchema = z.object({
  name: z.string().describe("Short label for this beat (2-4 words). E.g. 'Inciting Incident', 'False Victory', 'Reversal'."),
  purpose: z.string().describe("What this beat accomplishes for the audience in one sentence."),
  contentSummary: z.string().describe("Concrete summary of what HAPPENS in this beat — actions, revelations, who does what. 1-2 sentences."),
  tonalShift: z.enum([
    "intrigue",
    "tension",
    "relief",
    "dread",
    "wonder",
    "humor",
    "grief",
    "triumph",
    "unease",
    "warmth",
  ]).describe("Dominant emotional tone of this beat — must differ from the immediately preceding beat."),
  stakeLevel: z.number().min(1).max(5).describe("Stakes/intensity 1-5. The arc must escalate overall, but include at least one drop (false victory or quiet beat)."),
  isReversal: z.boolean().describe("True if this beat overturns an expectation set up by an earlier beat."),
});

const beatSheetSchema = z.object({
  premiseLine: z.string().describe("One-sentence logline for the story (subject + conflict + stake)."),
  voice: z.string().describe("The narrator's stance/voice in 6-12 words. E.g. 'wry skeptic who's been burned before', 'awed witness reluctant to name it'."),
  beats: z.array(beatSchema).min(5).max(7),
});

export async function generateBeatSheet(
  topicIdea: string,
  style: string,
  brief: CreativeBrief,
  language: string,
  researchPack?: ResearchPackWithClaims | null,
  model?: string,
): Promise<BeatSheet> {
  const primaryModel = model || LLM.storyModel;
  const langName = getLanguageName(language);
  const researchBlock = researchPack?.claims?.length
    ? `\n\n${formatResearchEvidence(researchPack)}`
    : "";

  const systemPrompt = `You are a story architect. Before any prose is written, you design the BEAT SHEET — the dynamic skeleton that makes a story move.

YOUR JOB:
Produce 5–7 beats that together form a story that is impossible to look away from. The beat sheet is what the writer will execute against — if it's flat, the story will be flat.

HARD REQUIREMENTS (enforce these — do not produce a beat sheet that violates them):
1. AT LEAST ONE REVERSAL: somewhere mid-to-late, a beat must overturn what the audience expected from earlier beats. Mark it with isReversal=true.
2. TONAL VARIATION: no two consecutive beats may share the same tonalShift. The story should feel like it's BREATHING, not droning.
3. STAKE DYNAMICS: stakes should escalate overall, but include at least one drop — a false victory, a quiet beat, or a moment of warmth — so the next escalation lands harder.
4. ESCALATING SPECIFICITY: each beat should reveal something concrete (a name, a number, an object, a turn) — not just "things get worse".
5. A REAL ENDING BEAT: the final beat must either land a punch (closed), refuse to land it (open), or pivot into a new question (cliffhanger) — matching the brief's resolutionType.

CREATIVE BRIEF (the beat sheet must serve this):
- Concept: ${brief.concept}
- Tone: ${brief.tone}
- Narrative arc: ${brief.narrativeArc}
- Pacing: ${brief.pacingStrategy}
- Reveal timing: ${brief.formatConstraints.revealTiming}
- Resolution type: ${brief.formatConstraints.resolutionType}
- Opening hook: ${brief.formatConstraints.openingHook}
- Scene budget downstream: ${brief.durationGuidance.sceneBudget.min}–${brief.durationGuidance.sceneBudget.max} scenes (your beats need not map 1:1 to scenes)

VOICE:
Pick a SPECIFIC narrator stance with attitude. "Neutral observer" is forbidden. The voice should have a stake, a bias, a tone. The writer will channel it.

OUTPUT LANGUAGE:
- The beat sheet is internal scaffolding — write all fields in English regardless of the story's final language (${langName}). The downstream writer will translate when executing.${researchBlock}`;

  const userPrompt = `Design the beat sheet for this story idea: ${topicIdea}\n\nVisual style context: ${style}.`;

  const { output } = await generateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: beatSheetSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.85,
  });
  if (!output) throw new Error("Failed to generate beat sheet");

  const hasReversal = output.beats.some((b) => b.isReversal);
  if (!hasReversal && output.beats.length >= 4) {
    output.beats[Math.floor(output.beats.length * 0.6)].isReversal = true;
  }

  return output;
}

export function formatBeatSheetForPrompt(beatSheet: BeatSheet): string {
  const lines = beatSheet.beats.map((b, i) => {
    const flags: string[] = [`tone=${b.tonalShift}`, `stakes=${b.stakeLevel}/5`];
    if (b.isReversal) flags.push("REVERSAL");
    return `  ${i + 1}. ${b.name} [${flags.join(", ")}]\n     Purpose: ${b.purpose}\n     What happens: ${b.contentSummary}`;
  });
  return `BEAT SHEET (the dynamic skeleton you must execute):
Premise: ${beatSheet.premiseLine}
Voice: ${beatSheet.voice}

Beats:
${lines.join("\n")}`;
}
