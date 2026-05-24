import { Output } from "ai";
import { z } from "zod";
import { LLM, getLanguageName } from "@/lib/constants";
import { openrouter } from "./index";
import { generateText } from "@/server/services/ai-audit";
import type {
  AudienceSegment,
  BeatSheet,
  CreativeBrief,
  NarrativeFramework,
  ResearchPackWithClaims,
} from "@/types/pipeline";
import { formatResearchEvidence } from "./research-evidence";

function formatFrameworkSkeleton(framework: NarrativeFramework | undefined): string {
  switch (framework) {
    case "AIDA":
      return `\nFRAMEWORK: AIDA — your beats MUST map onto Attention → Interest → Desire → Action.
- Beat 1 (Attention): the 0–2 second visual hook. Define what stops the scroll.
- Beat 2–3 (Interest): contextual build-up that sustains attention.
- Beat 4 (Desire): the emotional peak that makes the viewer want the outcome.
- Final beat (Action): the explicit transition that prompts the viewer to act / share / believe.
Use 4–5 beats total.`;
    case "PAS":
      return `\nFRAMEWORK: PAS — your beats MUST map onto Problem → Agitation → Solution.
- Beat 1 (Problem): open with a visceral pain point the audience recognizes.
- Beat 2–3 (Agitation): intensify the pain visually and emotionally — create urgency.
- Final beat (Solution): the resolution; mark it with isReversal=true if the relief overturns the dread.
Use 3–5 beats total.`;
    case "heros-journey":
      return `\nFRAMEWORK: Hero's Journey (compressed) — beats MUST map onto Challenge → Mentor/Tool → Victory.
- Beats 1–2 (Challenge): establish the protagonist and the impossible obstacle.
- Beat 3–4 (Mentor/Tool): introduce the catalyst (a mentor, a discovery, a tool) that changes the trajectory.
- Beats 5–7 (Victory): the transformation. At least one beat must be a reversal of an earlier expectation.
Use 5–7 beats total.`;
    case "freeform":
    case undefined:
    default:
      return `\nFRAMEWORK: freeform — the brief did not specify a structural framework. You may design any 5–7 beat structure that still satisfies the HARD REQUIREMENTS above.`;
  }
}

function formatAudienceForBeats(audience: AudienceSegment | undefined): string {
  if (!audience) return "";
  return `

AUDIENCE LENS (every beat should land for this viewer):
- Segment: ${audience.segment}
- Primary goal: ${audience.primaryGoal}
- Primary fear: ${audience.primaryFear}
- Emotional triggers: ${audience.emotionalTriggers.join("; ")}
- Tone to avoid: ${audience.toneToAvoid}`;
}

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
  stakeLevel: z.number().describe("Stakes/intensity as an integer from 1 (low) to 5 (peak). Use only the values 1, 2, 3, 4, or 5. The arc must escalate overall, but include at least one drop (false victory or quiet beat)."),
  isReversal: z.boolean().describe("True if this beat overturns an expectation set up by an earlier beat."),
});

const beatSheetSchema = z.object({
  premiseLine: z.string().describe("One-sentence logline for the story (subject + conflict + stake)."),
  voice: z.string().describe("The narrator's stance/voice in 6-12 words. E.g. 'wry skeptic who's been burned before', 'awed witness reluctant to name it'."),
  beats: z.array(beatSchema).describe("5 to 7 beats. Fewer is too thin; more is sprawl."),
});

export async function generateBeatSheet(
  topicIdea: string,
  style: string,
  brief: CreativeBrief,
  language: string,
  model: string,
  researchPack?: ResearchPackWithClaims | null,
): Promise<BeatSheet> {
  const primaryModel = model;
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
${formatFrameworkSkeleton(brief.narrativeFramework)}${formatAudienceForBeats(brief.audience)}

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

  if (output.beats.length < 3) {
    throw new Error(`Beat sheet has only ${output.beats.length} beats (need at least 3)`);
  }
  if (output.beats.length > 9) {
    output.beats = output.beats.slice(0, 9);
  }
  for (const b of output.beats) {
    b.stakeLevel = Math.min(5, Math.max(1, Math.round(b.stakeLevel)));
  }

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
