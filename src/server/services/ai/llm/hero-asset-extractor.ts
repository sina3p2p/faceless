import { Output } from "ai";
import { generateText } from "@/server/services/ai-audit";
import { z } from "zod";
import { LLM } from "@/lib/constants";
import { openrouter } from "./index";
import type {
  CreativeBrief,
  ContinuityNotes,
  VisualStyleGuide,
  HeroAssetPlan,
} from "@/types/pipeline";

const heroAssetTypeEnum = z.enum(["character", "location", "prop"]);

const heroAssetEntrySchema = z.object({
  name: z
    .string()
    .describe(
      "Canonical, specific name. For characters use the canonicalName from continuity; for vehicles/props/locations use the most specific identifier from the script (e.g. 'F-4 Phantom (lead, Bravo Six)', not just 'plane')."
    ),
  type: heroAssetTypeEnum,
  description: z
    .string()
    .describe("One-sentence narrative role: what this entity is and why it matters."),
  appearance: z
    .string()
    .describe(
      "Visually specific traits drawn from the script — clothing/age/build for characters; livery/markings/era/condition for vehicles; materials/distinguishing geometry for props; architecture/era/biome for locations."
    ),
  sheetPromptHints: z
    .string()
    .describe(
      "Pose, framing, angle, and lighting guidance for the reference sheet. Examples: 'A-pose, front-facing, neutral expression' (character); 'three-quarter aerial view, full aircraft visible, clean studio backdrop' (vehicle); 'wide establishing, sun mid-sky, no characters' (location)."
    ),
  rationale: z
    .string()
    .describe(
      "Why this entity needs a locked visual reference (recurrence count, continuity risk, identity-defining)."
    ),
});

const heroAssetPlanSchema = z.object({
  entries: z.array(heroAssetEntrySchema),
});

export interface HeroAssetExtractorInput {
  script: string;
  scenes: Array<{ sceneTitle: string | null; text: string; directorNote: string | null }>;
  brief: CreativeBrief;
  continuity: ContinuityNotes;
  visualStyleGuide?: VisualStyleGuide;
  /** Hard cap on number of hero assets the agent may pick. Defaults to 6. */
  maxAssets?: number;
}

/**
 * Extract the set of entities (characters, vehicles, props, signature locations)
 * that benefit from a locked visual reference image. Returns ONLY a plan — no
 * images are generated here.
 */
export async function extractHeroAssetPlan(
  input: HeroAssetExtractorInput,
  model?: string
): Promise<HeroAssetPlan> {
  const primaryModel = model || LLM.supervisorModel;
  const maxAssets = input.maxAssets ?? 6;

  const sceneSummary = input.scenes
    .map(
      (s, i) =>
        `Scene ${i} — "${s.sceneTitle ?? ""}":\n  ${s.text}\n  Director note: ${s.directorNote ?? ""}`
    )
    .join("\n\n");

  const characterPriors = input.continuity.characterRegistry
    .map(
      (c) =>
        `  - ${c.canonicalName} (${c.presentInScenes.length} scenes): ${c.appearance.clothing}; ${c.appearance.hair}; ${c.appearance.distinguishingFeatures}`
    )
    .join("\n");

  const locationPriors = input.continuity.locationRegistry
    .map(
      (l) =>
        `  - ${l.canonicalName} (${l.presentInScenes.length} scenes): ${l.description}`
    )
    .join("\n");

  const styleHint = input.visualStyleGuide
    ? `\n\nVISUAL STYLE (apply when describing sheets):\n  Medium: ${input.visualStyleGuide.global.medium}\n  Material language: ${input.visualStyleGuide.global.materialLanguage}\n  Color palette: ${input.visualStyleGuide.global.colorPalette.join(", ")}`
    : "";

  const systemPrompt = `You are a Production Designer building the asset list for a short video.

Your single job: pick the entities that NEED a locked visual reference image so they look identical across every frame they appear in. Think of yourself as the casting director and prop master combined.

WHAT QUALIFIES AS A HERO ASSET:
- Characters that appear in 2+ scenes OR are visually identifiable (named protagonist, antagonist, recurring face).
- Vehicles, mechs, aircraft, vessels, robots — anything mechanical with specific livery, markings, era, or model. Example: "Two F-4 Phantoms (Bravo Six and Bravo Seven)" — yes. Generic "a car" — no.
- Signature props that recur or define identity — a specific weapon, a particular briefcase, a hero gadget.
- Signature locations — a specific cockpit, a particular bedroom, a unique landmark. NOT generic settings ("a sky", "a forest", "a city street").

DO NOT INCLUDE:
- Crowds, anonymous extras, "people" plural.
- Generic environmental elements (weather, sky, generic buildings).
- One-off background props with no narrative weight.
- Anything that is described differently every time it appears (those aren't locked entities — they're variation).

OUTPUT BUDGET: at most ${maxAssets} entries. If more candidates exist, pick the highest-impact ones — entries whose visual inconsistency would most damage the video.

NAMING:
- For characters in the continuity registry, MIRROR the canonicalName exactly.
- For other entities, use a specific identifier from the script. Two F-4s become two entries: "F-4 Phantom (Bravo Six)" and "F-4 Phantom (Bravo Seven)" — only if the script differentiates them. Otherwise one entry: "F-4 Phantom".

CONTINUITY PRIORS (use these names verbatim for characters; treat as starting suggestions for locations — you may add or skip):
Characters:
${characterPriors || "  (none)"}
Locations:
${locationPriors || "  (none)"}${styleHint}`;

  const userPrompt = `SCRIPT:
${input.script}

SCENES:
${sceneSummary}

CREATIVE BRIEF:
  Concept: ${input.brief.concept}
  Tone: ${input.brief.tone}
  Visual mood: ${input.brief.visualMood}

Produce the hero asset plan now. Output the array with at most ${maxAssets} entries, ordered by importance (most identity-critical first).`;

  const { output } = await generateText({
    model: openrouter.chat(primaryModel),
    output: Output.object({ schema: heroAssetPlanSchema }),
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,
  });

  if (!output) throw new Error("Failed to extract hero asset plan");

  const trimmed: HeroAssetPlan = {
    entries: output.entries.slice(0, maxAssets),
  };
  return trimmed;
}

/**
 * Build the image-generation prompt for a single hero asset sheet, applying the
 * visual style guide so sheets match the film's look.
 */
export function buildHeroAssetSheetPrompt(
  entry: HeroAssetPlan["entries"][number],
  styleGuide?: VisualStyleGuide
): string {
  const style = styleGuide
    ? `${styleGuide.global.medium}. Material language: ${styleGuide.global.materialLanguage}. Color palette: ${styleGuide.global.colorPalette.join(", ")}.`
    : "Photorealistic cinematic style.";

  const framing =
    entry.type === "character"
      ? "Full-body neutral A-pose, facing camera, neutral expression, plain neutral grey backdrop, even key lighting, sharp focus, no environmental context."
      : entry.type === "prop"
        ? "Three-quarter hero shot, full subject visible, clean neutral backdrop, studio softbox lighting, no human figures, no environmental context."
        : "Wide establishing shot, neutral time of day, no characters present, balanced exposure.";

  return [
    `Reference sheet for "${entry.name}".`,
    style,
    `Subject: ${entry.appearance}.`,
    `Framing: ${framing}`,
    entry.sheetPromptHints,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Aspect ratio appropriate for a given hero asset type's reference sheet. */
export function aspectRatioForHeroAsset(
  type: HeroAssetPlan["entries"][number]["type"]
): "9:16" | "1:1" | "16:9" {
  if (type === "character") return "9:16";
  if (type === "location") return "16:9";
  return "1:1";
}
