import { generateText, Output } from "ai";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type {
  CreativeBrief,
  ContinuityNotes,
  FrameBreakdown,
  HeroAssetPlan,
} from "@/types/pipeline";
import type { TVideoScene } from "@/types/video";

const frameSpecSchema = z.object({
  clipDuration: z.number().describe("Duration in seconds — must be one of the supported values"),
  shotType: z.enum(["establishing", "wide", "medium", "close-up", "extreme-close-up", "detail", "over-shoulder"]),
  narrativeIntent: z.enum(["introduce", "build", "climax", "react", "transition", "resolve"]),
  motionPolicy: z.enum(["static", "subtle", "moderate", "dynamic", "frenetic"]),
  transitionIn: z.enum(["cut", "dissolve", "fade", "match-cut", "whip-pan"]),
  subjectFocus: z.string().describe("Who/what dominates this frame — use a canonical character name from continuity, or describe the object"),
  pacingNote: z.string().describe("Brief note on timing feel: 'hold for impact', 'quick cut to maintain energy'"),
  sfxHint: z.enum(["whoosh", "impact", "hit", "riser", "none"]).optional().describe("Optional sound-effect cue at the START of this frame. Use sparingly — only on climax beats, big transitions, or true emphasis moments."),
});

const frameBreakdownSchema = z.object({
  scenes: z.array(
    z.object({
      frames: z.array(frameSpecSchema),
    })
  ),
});

export async function generateFrameBreakdown(
  scenes: TVideoScene[],
  supportedClipDurations: number[],
  brief: CreativeBrief,
  duration: number,
  continuity: ContinuityNotes,
  model?: string,
  heroAssetPlan?: HeroAssetPlan
): Promise<FrameBreakdown> {
  const primaryModel = model || LLM.storyboardModel;

  const sortedDurations = [...supportedClipDurations].sort((a, b) => a - b);
  const durationsList = sortedDurations.join(", ");

  const characterNames = continuity.characterRegistry.map((c) => c.canonicalName);
  const locationNames = continuity.locationRegistry.map((l) => l.canonicalName);
  const lockedHeroEntities = (heroAssetPlan?.entries ?? []).filter((e) => e.assetRef);
  const lockedHeroSection = lockedHeroEntities.length > 0
    ? `\nLOCKED HERO ENTITIES (these have approved reference images — use the EXACT name in subjectFocus when the entity is on screen, do NOT redescribe their appearance):\n${lockedHeroEntities
        .map((e) => `  - ${e.name} (${e.type}): ${e.description}`)
        .join("\n")}`
    : "";

  const sceneSummary = scenes.map((s, i) => {
    const chars = continuity.characterRegistry
      .filter((c) => c.presentInScenes.includes(i))
      .map((c) => c.canonicalName);
    return `Scene ${i} — "${s.sceneTitle}" (audio: ${s.duration}s):\n  "${s.text}"\n  Director: ${s.directorNote}\n  Characters present: ${chars.join(", ") || "none"}`;
  }).join("\n\n");

  const systemPrompt = `You are a Storyboard Agent planning the frame-by-frame breakdown for a video production.

SUPPORTED CLIP DURATIONS: [${durationsList}] seconds — every clipDuration MUST be one of these values.

DURATION CONSTRAINTS (from generated audio — TTS or final song):
- Target total duration: ${duration}s
- GOAL: keep the sum of all clipDurations as close to ${duration}s as allowed clip lengths permit, without going far over
- The sum of all clipDurations across all scenes must approximate that total; per-scene frame sums must still cover each scene's audio below
- Per-scene audio length (sum these for a cross-check: ${scenes.map((s) => s.duration + "s").join(" + ")} = ${scenes.reduce((a, s) => a + s.duration, 0)}s)
- Each scene's frames' clipDurations should sum to at least that scene's audio seconds (${scenes.map((s) => s.duration + "s").join(", ")})

PACING STRATEGY: ${brief.pacingStrategy}

KNOWN CHARACTERS: ${characterNames.join(", ") || "none"}
KNOWN LOCATIONS: ${locationNames.join(", ") || "none"}${lockedHeroSection}

RULES:
1. clipDuration MUST be from [${durationsList}] — no other values
2. ONE ACTION PER FRAME (STRICT): each frame holds exactly one motion beat. When a story moment contains multiple distinct actions, SPLIT them across consecutive frames — one beat per frame — instead of packing them into a single longer clip. This applies to every genre: dialogue (a glance / a turn / a reply are three frames), action (a draw / an aim / a fire are three frames), environment (wind rises / leaves swirl / a door slams are three frames), performance (a strum / a step / a head-toss are three frames). AI video models render compound actions as morphing artifacts; the cure is more frames, not denser prompts.
3. NO ARTIFICIAL FRAME-COUNT CAP: do not minimise frame count for its own sake. Action density drives frame count. A scene with five distinct beats needs five frames, not one. Each scene's frames should sum to at least that scene's audio duration; when the moment is dense, add more frames at the SHORTEST supported clipDuration that still lets a single beat register as motion (build-in, peak, settle). Avoid the absolute minimum only when a beat genuinely needs build-up.
4. narrativeIntent must match the story moment:
   - "introduce": first appearance of character or setting
   - "build": rising tension, adding detail
   - "climax": peak emotional/dramatic moment
   - "react": character's response to an event
   - "transition": bridging between scenes or beats
   - "resolve": conclusion, settling
5. motionPolicy must match the narrative moment:
   - "static": establishing shots, somber moments, still environments
   - "subtle": quiet character moments, emotional beats, breathing
   - "moderate": normal actions, walking, talking
   - "dynamic": action sequences, dramatic reveals, fast movement
   - "frenetic": chase scenes, fights, extreme urgency
   ENERGY DOES NOT DROP WHEN BEATS SPLIT: judge each frame's policy by the intensity of THAT single beat in isolation, not by how many beats sit alongside it. A punch-landing frame is "frenetic" even though it's the only beat; a head-snap reaction is "dynamic" even alone; a held breath before the kiss is "subtle" because the beat is small, not because there's only one. Do NOT bias toward "subtle"/"moderate" because rule 2 limits each frame to one action — that's a count, not an intensity. High-energy moments should produce strings of "dynamic"/"frenetic" frames; quiet moments should produce strings of "subtle" ones.
6. subjectFocus must be a canonicalName from the character/location registry, or a specific described object
7. transitionIn:
   - "cut": default, for maintaining energy
   - "dissolve": time passing, dreamlike
   - "fade": scene boundaries, emotional weight
   - "match-cut": visual/thematic linking between shots
   - "whip-pan": high energy transitions only
8. First frame of the video should use "fade" transitionIn
9. You MUST produce exactly ${scenes.length} scene entries, one per input scene
10. If the total duration would exceed ${duration}s, prefer SHORTENING individual clipDurations (within supported values) over removing frames; only drop frames as a last resort, and never to evade rule 2 by re-packing two beats into one clip
11. SHOT VARIETY (the cut should breathe — never lock into one focal length):
    - Any scene with ≥3 frames MUST contain at least one "establishing" or "wide" shot
    - Across the whole video, include at least one "close-up", "extreme-close-up", or "detail" shot every 5 frames (so the audience gets emotional anchors)
    - Avoid more than 2 consecutive "medium" shots — vary the rhythm
12. SFX HINT (optional, sparingly): emit "sfxHint" only on climax beats, hard transitions, or single high-emphasis moments. Most frames should leave it blank/"none". Allowed values: "whoosh" | "impact" | "hit" | "riser" | "none".`;

  const { output } = await generateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: frameBreakdownSchema }),
    system: systemPrompt,
    prompt: `Create the frame breakdown for these ${scenes.length} scenes:\n\n${sceneSummary}`,
    temperature: 0.5,
  });
  if (!output) throw new Error("Failed to generate frame breakdown");

  const violations = validateShotBudget(output);
  if (violations.length === 0) return output;

  console.warn(
    `[storyboard] Shot-budget violations on first pass: ${violations.join("; ")}. Re-prompting once.`
  );

  const fixupNote = `Your previous breakdown violated shot-variety rule 10:\n- ${violations.join("\n- ")}\nPlease fix these violations while keeping the same scene count, narrative intent, and durations.`;

  try {
    const { output: retry } = await generateText({
      model: openrouter.chat(primaryModel),
      output: Output.object({ schema: frameBreakdownSchema }),
      system: systemPrompt,
      prompt: `Create the frame breakdown for these ${scenes.length} scenes:\n\n${sceneSummary}\n\n${fixupNote}`,
      temperature: 0.5,
    });
    if (retry) {
      const retryViolations = validateShotBudget(retry);
      if (retryViolations.length > 0) {
        console.warn(
          `[storyboard] Shot-budget violations remain after retry: ${retryViolations.join("; ")}. Accepting anyway.`
        );
      }
      return retry;
    }
  } catch (err) {
    console.warn(`[storyboard] Shot-budget retry failed (${err instanceof Error ? err.message : err}); accepting first pass.`);
  }
  return output;
}

/**
 * Deterministic post-LLM validator for the storyboarder's shot variety rules.
 * Returns one short message per violation; an empty array means the breakdown
 * passes. Designed to be cheap and side-effect free so callers can use it in
 * tests and at runtime.
 */
export function validateShotBudget(breakdown: FrameBreakdown): string[] {
  const violations: string[] = [];

  const wideish = new Set(["establishing", "wide"]);
  const closeish = new Set(["close-up", "extreme-close-up", "detail"]);

  // Rule: any scene with ≥3 frames must include at least one establishing/wide shot.
  for (let s = 0; s < breakdown.scenes.length; s++) {
    const frames = breakdown.scenes[s]?.frames ?? [];
    if (frames.length >= 3 && !frames.some((f) => wideish.has(f.shotType))) {
      violations.push(`scene ${s} (${frames.length} frames) lacks an establishing/wide shot`);
    }
  }

  // Flatten to a global frame list for sliding-window rules.
  const flat = breakdown.scenes.flatMap((scene, sceneIdx) =>
    (scene?.frames ?? []).map((f, frameIdx) => ({ ...f, sceneIdx, frameIdx }))
  );

  // Rule: at least one close-up/extreme-close-up/detail every 5 frames.
  for (let i = 0; i + 5 <= flat.length; i++) {
    const window = flat.slice(i, i + 5);
    if (!window.some((f) => closeish.has(f.shotType))) {
      violations.push(`frames ${i}-${i + 4} contain no close-up/detail shot`);
    }
  }

  // Rule: no more than 2 consecutive "medium" shots.
  let mediumRun = 0;
  for (let i = 0; i < flat.length; i++) {
    if (flat[i].shotType === "medium") {
      mediumRun++;
      if (mediumRun === 3) {
        violations.push(`three consecutive medium shots starting at frame ${i - 2}`);
      }
    } else {
      mediumRun = 0;
    }
  }

  return violations;
}
