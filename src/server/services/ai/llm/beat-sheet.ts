import { Output } from "ai";
import { z } from "zod";
import { getLanguageName } from "@/lib/constants";
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
  emotionalFunction: z.string().describe("What the character must feel or face in this beat — the internal experience that is unavoidable. E.g. 'Mara must sit with the knowledge that her loyalty was never returned.'"),
  characterPressure: z.string().describe("The external or relational force applied to the character that makes the beat happen — what creates the dramatic situation. E.g. 'Marcus arrives to collect on a debt she cannot pay, in front of the one person whose respect she cannot afford to lose.'"),
  requiredChange: z.string().describe("How the character's internal or external state MUST be different by the end of this beat — the irreversible shift. E.g. 'By the end, Mara has publicly defended Marcus while privately pocketing the evidence against him — she has crossed a line she cannot uncross.'"),
  physicalExecution: z.string().describe("A concrete physical element present in this beat — an object, a location detail, or a physical action — left open so the screenwriter invents the specific form. Give the dramatic engine, not the scene. E.g. 'A physical document changes hands (or is hidden). The screenwriter decides what it contains.'"),
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

BEAT STRUCTURE — each beat has four components:
1. emotionalFunction: what the character must feel or face — the internal experience that is unavoidable.
2. characterPressure: the external or relational force applied — what creates the dramatic situation.
3. requiredChange: how the character's internal or external state MUST be different by the end of this beat — the irreversible shift.
4. physicalExecution: a concrete physical element present (object, location, action) — give the dramatic engine, leave the specific form open for the screenwriter to invent.

PHYSICALEXECUTION RULE (critical):
This field gives the screenwriter a dramatic engine without pre-writing the scene. It must name a concrete physical element — an object that appears, a location with a specific quality, a physical action with consequences — but leave what it contains or means open.
- WRONG: "The truth comes out." (no physical anchor)
- WRONG: "Mara finds the invoice and learns her father paid for the room." (over-specified — the screenwriter has nothing to discover)
- RIGHT: "A physical document changes hands or is hidden. The screenwriter decides what it reveals."
- RIGHT: "An object from their shared past reappears in a context that makes its original meaning impossible."

HARD REQUIREMENTS:
1. AT LEAST ONE REVERSAL: somewhere mid-to-late, a beat must overturn what the audience expected. Mark it isReversal=true.
2. TONAL VARIATION: no two consecutive beats may share the same tonalShift.
3. STAKE DYNAMICS: escalate overall, but include at least one drop so the next escalation lands harder.
4. A REAL ENDING BEAT: closed punch, open ambiguity, or cliffhanger — matching the brief's resolutionType.

CREATIVE BRIEF (the beat sheet must serve this):
- Concept: ${brief.concept}
- Tone: ${brief.tone}
- Narrative arc: ${brief.narrativeArc}
- Pacing: ${brief.pacingStrategy}
- Reveal timing: ${brief.formatConstraints.revealTiming}
- Resolution type: ${brief.formatConstraints.resolutionType}
- Opening hook: ${brief.formatConstraints.openingHook}
- Scene budget downstream: ${brief.durationGuidance.sceneBudget.min}–${brief.durationGuidance.sceneBudget.max} scenes
${formatFrameworkSkeleton(brief.narrativeFramework)}${formatAudienceForBeats(brief.audience)}

VOICE:
Pick a SPECIFIC narrator stance with attitude. "Neutral observer" is forbidden. The voice should have a stake, a bias, a tone. The writer will channel it.

OUTPUT LANGUAGE:
All fields in English regardless of the story's final language (${langName}).${researchBlock}`;

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
    return [
      `  ${i + 1}. ${b.name} [${flags.join(", ")}]`,
      `     Purpose: ${b.purpose}`,
      `     Emotional function: ${b.emotionalFunction}`,
      `     Character pressure: ${b.characterPressure}`,
      `     Required change: ${b.requiredChange}`,
      `     Physical engine: ${b.physicalExecution}`,
    ].join("\n");
  });
  return `BEAT SHEET (execute this arc — honor emotional function and required change per beat; the physical engine is yours to realize):
Premise: ${beatSheet.premiseLine}
Voice: ${beatSheet.voice}

Beats:
${lines.join("\n")}`;
}
