import { generateText as aiGenerateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type {
  CreativeBrief,
  ContinuityNotes,
  DurationPreference,
  FrameBreakdown,
} from "@/lib/types";

export interface StoryboardSceneInput {
  sceneTitle: string;
  text: string;
  directorNote: string;
  ttsDuration: number;
}

const frameSpecSchema = z.object({
  clipDuration: z.number().describe("Duration in seconds — must be one of the supported values"),
  shotType: z.enum(["establishing", "wide", "medium", "close-up", "extreme-close-up", "detail", "over-shoulder"]),
  narrativeIntent: z.enum(["introduce", "build", "climax", "react", "transition", "resolve"]),
  motionPolicy: z.enum(["static", "subtle", "moderate", "dynamic", "frenetic"]),
  transitionIn: z.enum(["cut", "dissolve", "fade", "match-cut", "whip-pan"]),
  subjectFocus: z.string().describe("Who/what dominates this frame — use a canonical character name from continuity, or describe the object"),
  pacingNote: z.string().describe("Brief note on timing feel: 'hold for impact', 'quick cut to maintain energy'"),
});

const frameBreakdownSchema = z.object({
  scenes: z.array(
    z.object({
      frames: z.array(frameSpecSchema),
    })
  ),
});

export async function generateFrameBreakdown(
  scenes: StoryboardSceneInput[],
  supportedClipDurations: number[],
  brief: CreativeBrief,
  duration: DurationPreference,
  continuity: ContinuityNotes,
  model?: string
): Promise<FrameBreakdown> {
  const primaryModel = model || LLM.storyboardModel;

  const sortedDurations = [...supportedClipDurations].sort((a, b) => a - b);
  const durationsList = sortedDurations.join(", ");

  const characterNames = continuity.characterRegistry.map((c) => c.canonicalName);
  const locationNames = continuity.locationRegistry.map((l) => l.canonicalName);

  const sceneSummary = scenes.map((s, i) => {
    const chars = continuity.characterRegistry
      .filter((c) => c.presentInScenes.includes(i))
      .map((c) => c.canonicalName);
    return `Scene ${i} — "${s.sceneTitle}" (audio: ${s.ttsDuration}s):\n  "${s.text}"\n  Director: ${s.directorNote}\n  Characters present: ${chars.join(", ") || "none"}`;
  }).join("\n\n");

  const systemPrompt = `You are a Storyboard Agent planning the frame-by-frame breakdown for a video production.

SUPPORTED CLIP DURATIONS: [${durationsList}] seconds — every clipDuration MUST be one of these values.

DURATION CONSTRAINTS:
- Target: ${duration.preferred}s (range: ${duration.min}s–${duration.max}s)
- Priority: ${duration.priority}
- The sum of all clipDurations across all scenes should approximate the total video duration
- Each scene's total frame duration should cover its audio duration (${scenes.map((s) => s.ttsDuration + "s").join(", ")})

PACING STRATEGY: ${brief.pacingStrategy}

KNOWN CHARACTERS: ${characterNames.join(", ") || "none"}
KNOWN LOCATIONS: ${locationNames.join(", ") || "none"}

RULES:
1. clipDuration MUST be from [${durationsList}] — no other values
2. Each scene's frames should sum to at least the scene's audio duration
3. narrativeIntent must match the story moment:
   - "introduce": first appearance of character or setting
   - "build": rising tension, adding detail
   - "climax": peak emotional/dramatic moment
   - "react": character's response to an event
   - "transition": bridging between scenes or beats
   - "resolve": conclusion, settling
4. motionPolicy must match the narrative moment:
   - "static": establishing shots, somber moments, still environments
   - "subtle": quiet character moments, emotional beats, breathing
   - "moderate": normal actions, walking, talking
   - "dynamic": action sequences, dramatic reveals, fast movement
   - "frenetic": chase scenes, fights, extreme urgency
5. subjectFocus must be a canonicalName from the character/location registry, or a specific described object
6. transitionIn:
   - "cut": default, for maintaining energy
   - "dissolve": time passing, dreamlike
   - "fade": scene boundaries, emotional weight
   - "match-cut": visual/thematic linking between shots
   - "whip-pan": high energy transitions only
7. First frame of the video should use "fade" transitionIn
8. You MUST produce exactly ${scenes.length} scene entries, one per input scene
9. If priority is "duration" and total would exceed ${duration.max}s, reduce frame count in later scenes`;

  const { output } = await aiGenerateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: frameBreakdownSchema }),
    system: systemPrompt,
    prompt: `Create the frame breakdown for these ${scenes.length} scenes:\n\n${sceneSummary}`,
    temperature: 0.5,
  });
  if (!output) throw new Error("Failed to generate frame breakdown");

  return output;
}
