import { Output } from "ai";
import { generateText } from "@/server/services/ai-audit";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type {
  CreativeBrief,
  ContinuityNotes,
  FrameBreakdown,
  FrameSpec,
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
  isSpeakingCloseup: z.boolean().optional().describe("True ONLY when this frame is a close-up or medium-close on the character who is SPEAKING this scene's line, with their face clearly visible and lip-syncable. False for cutaways, wide/establishing shots, listeners/reaction shots, objects, hands, or any narrator-over-visuals frame. Be conservative — when in doubt, false."),
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
12. SFX HINT (optional, sparingly): emit "sfxHint" only on climax beats, hard transitions, or single high-emphasis moments. Most frames should leave it blank/"none". Allowed values: "whoosh" | "impact" | "hit" | "riser" | "none".
13. SPEAKING CLOSE-UP (for lip-sync): set "isSpeakingCloseup": true ONLY for a close-up / extreme-close-up / medium shot that is ON the character delivering this scene's spoken line, face clearly visible (not turned away, not silhouetted). Set false for every wide/establishing shot, cutaway, reaction/listener shot, object/hand insert, and any narration-over-visuals frame. A scene with dialogue typically has at most one or two such frames. Be conservative — false unless the speaking face genuinely fills the frame.`;

  const userPrompt = `Create the frame breakdown for these ${scenes.length} scenes:\n\n${sceneSummary}`;
  const { output } = await generateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: frameBreakdownSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.5,
  });
  if (!output) throw new Error("Failed to generate frame breakdown");

  // Guarantee exactly one breakdown entry per input scene. The LLM is told to
  // do this (rule 9) but can still drop/merge scenes, especially with many
  // short scenes (e.g. a dialogue-driven movie). Without this, a missing entry
  // makes the downstream prompt stage throw "Missing frame breakdown".
  const finalize = (b: FrameBreakdown): FrameBreakdown =>
    normalizeBreakdownToScenes(b, scenes, sortedDurations, continuity);

  const violations = validateShotBudget(output);
  if (violations.length === 0) return finalize(output);

  console.warn(
    `[storyboard] Shot-budget violations on first pass: ${violations.join("; ")}. Re-prompting once.`
  );

  const fixupNote = `Your previous breakdown violated shot-variety rule 10:\n- ${violations.join("\n- ")}\nPlease fix these violations while keeping the same scene count, narrative intent, and durations.`;

  try {
    const retryPrompt = `Create the frame breakdown for these ${scenes.length} scenes:\n\n${sceneSummary}\n\n${fixupNote}`;
    const { output: retry } = await generateText({
      model: openrouter.chat(primaryModel),
      output: Output.object({ schema: frameBreakdownSchema }),
      system: systemPrompt,
      prompt: retryPrompt,
      temperature: 0.5,
    });
    if (retry) {
      const retryViolations = validateShotBudget(retry);
      if (retryViolations.length > 0) {
        console.warn(
          `[storyboard] Shot-budget violations remain after retry: ${retryViolations.join("; ")}. Accepting anyway.`
        );
      }
      return finalize(retry);
    }
  } catch (err) {
    console.warn(`[storyboard] Shot-budget retry failed (${err instanceof Error ? err.message : err}); accepting first pass.`);
  }
  return finalize(output);
}

/**
 * Force the breakdown to have exactly one entry per input scene. Missing or
 * empty scenes get a synthesized single default frame; extra entries beyond
 * the scene count are dropped. This keeps the storyboard→prompts contract
 * intact no matter how the LLM under/over-produces.
 */
export function normalizeBreakdownToScenes(
  breakdown: FrameBreakdown,
  scenes: TVideoScene[],
  sortedDurations: number[],
  continuity: ContinuityNotes
): FrameBreakdown {
  const minDur = sortedDurations[0] ?? 2;
  const maxDur = sortedDurations[sortedDurations.length - 1] ?? minDur;

  // Deterministic guard for the lip-sync flag: only honor it for a
  // non-narrator speaking scene on a tight enough shot. Applied to both LLM
  // output and synthesized defaults so the lip-sync stage can trust the flag.
  const lipSyncShots = new Set(["close-up", "extreme-close-up", "medium"]);
  const clampSpeakingCloseup = (
    frames: FrameSpec[],
    scene: TVideoScene
  ): FrameSpec[] => {
    const speaker = scene.speaker?.trim().toLowerCase();
    const speaks = !!speaker && speaker !== "narrator";
    return frames.map((f) => ({
      ...f,
      isSpeakingCloseup:
        speaks && f.isSpeakingCloseup === true && lipSyncShots.has(f.shotType),
    }));
  };

  const out = scenes.map((scene, i) => {
    const existing = breakdown.scenes[i];
    if (existing && existing.frames.length > 0) {
      return { frames: clampSpeakingCloseup(existing.frames, scene) };
    }

    console.warn(
      `[storyboard] No frames returned for scene ${i} — synthesizing a default frame to preserve scene parity.`
    );

    const audioSec = Math.ceil(scene.duration || 0);
    const clipDuration =
      audioSec > 0
        ? sortedDurations.find((d) => d >= audioSec) ?? maxDur
        : minDur;

    const speaker = scene.speaker?.trim();
    const subjectFocus =
      speaker && speaker.toLowerCase() !== "narrator"
        ? speaker
        : continuity.characterRegistry.find((c) => c.presentInScenes.includes(i))
          ?.canonicalName ??
        continuity.characterRegistry[0]?.canonicalName ??
        "";

    const frame: FrameSpec = {
      clipDuration,
      shotType: "medium",
      narrativeIntent:
        i === 0 ? "introduce" : i === scenes.length - 1 ? "resolve" : "build",
      motionPolicy: "moderate",
      transitionIn: "cut",
      subjectFocus,
      pacingNote: "Auto-generated: storyboard returned no frames for this scene.",
      sfxHint: "none",
      isSpeakingCloseup: false,
    };
    return { frames: [frame] };
  });

  return { scenes: out };
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
