import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { LLM } from "@/lib/constants";

export const openrouter = createOpenRouter({
  apiKey: LLM.apiKey,
});

// ── Shared Types ──

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface StoryAsset {
  name: string;
  description: string;
  type: "character" | "location" | "prop";
}

// ── Shared Helpers ──

export function buildAssetBlock(assets: StoryAsset[]): string {
  if (assets.length === 0) return "";
  const characters = assets.filter((a) => a.type === "character");
  const locations = assets.filter((a) => a.type === "location");
  const props = assets.filter((a) => a.type === "prop");

  let block = "\n\nSTORY ASSETS (you MUST reference these by exact name in imagePrompt, visualDescription, and assetRefs):";
  if (characters.length > 0) {
    block += "\n  Characters:";
    characters.forEach((c) => { block += `\n    - ${c.name}: ${c.description}`; });
  }
  if (locations.length > 0) {
    block += "\n  Locations:";
    locations.forEach((l) => { block += `\n    - ${l.name}: ${l.description}`; });
  }
  if (props.length > 0) {
    block += "\n  Props:";
    props.forEach((p) => { block += `\n    - ${p.name}: ${p.description}`; });
  }
  block += `\n\nASSET RULES:
- DO NOT describe character/location/prop physical appearance in imagePrompt. The AI image model receives reference images for each asset — describing appearance wastes prompt space and can conflict with the reference.
- Reference characters by NAME only in imagePrompt (e.g. "Elena stands at the cliff edge" NOT "Elena, a young woman with long dark hair and green eyes, stands at the cliff edge").
- imagePrompt should focus on: ACTION, POSE, CAMERA ANGLE, COMPOSITION, LIGHTING, and SETTING details.
- The assetRefs array for each scene MUST list the exact names of all assets visible in that scene.
- Characters: include when visible. Locations: include when the scene takes place there. Props: include when visible.
`;
  return block;
}

export function buildInputTypeInstruction(prompt: string): string {
  if (prompt.length < 200) {
    return `Expand this idea into a compelling video narrative. Create a complete story arc with vivid scenes.\n\nIDEA: ${prompt}`;
  }
  return `Adapt the following story into a scene-by-scene video script. Preserve the plot, characters, and key moments. Break it into scenes suitable for short-form video.\n\nSTORY:\n${prompt}`;
}

export function buildDurationInstruction(targetDuration: number, durations?: number[]): string {
  if (!durations || durations.length === 0) {
    return `- Total duration should be ${targetDuration} seconds\n- Aim for 5-7 scenes`;
  }
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const isFlexible = durations.length > 2;
  if (isFlexible) {
    return [
      `- Total duration should be ${targetDuration} seconds`,
      `- Each scene duration MUST be a whole number between ${min} and ${max} seconds (inclusive)`,
      `- You decide how many scenes to create — split the total time into scenes that each fit within ${min}-${max}s`,
      `- Vary scene durations naturally: quick cuts (${min}-${min + 2}s) for action, longer holds (${max - 3}-${max}s) for emotional beats`,
    ].join("\n");
  }
  const allowed = durations.join(" or ");
  return [
    `- Total duration should be ${targetDuration} seconds`,
    `- Each scene duration MUST be exactly ${allowed} seconds — no other values`,
    `- You decide how many scenes to create to fill the total duration using only ${allowed}s scenes`,
  ].join("\n");
}

export function buildMusicDurationInstruction(targetDuration: number, durations?: number[]): string {
  if (!durations || durations.length === 0) {
    if (targetDuration <= 30) return "Aim for 3-4 SHORT sections only (e.g. Intro + Verse + Chorus + Outro). Keep each section to 2-4 lines of lyrics MAX. Fewer sections = shorter song.";
    if (targetDuration <= 45) return "Aim for 4-5 sections (e.g. Intro + Verse + Chorus + Verse + Outro). Keep lyrics concise — 2-4 lines per section.";
    return "Aim for 5-7 sections: Intro + 2 Verses + 2 Choruses + Bridge/Outro.";
  }
  const min = Math.min(...durations);
  const max = Math.max(...durations);
  const isFlexible = durations.length > 2;
  if (isFlexible) {
    return [
      `Each section's durationMs must produce a whole number of seconds between ${min} and ${max} (e.g. ${min * 1000}-${max * 1000}ms).`,
      `You decide how many sections to create — split the ~${targetDuration}s total into sections that each fit within ${min}-${max}s.`,
      `Vary section lengths: short bursts (${min}-${min + 2}s) for intros/outros, longer holds (${max - 3}-${max}s) for verses/choruses.`,
    ].join(" ");
  }
  const allowed = durations.join(" or ");
  return `Each section's durationMs MUST produce exactly ${allowed} seconds (i.e. ${durations.map(d => d * 1000).join(" or ")}ms). You decide how many sections to create to fill ~${targetDuration}s using only ${allowed}s sections.`;
}

// ── Re-export everything from sub-modules ──

export * from "./story";
export * from "./director";
export * from "./prompts";
export * from "./motion";
export * from "./music";
export * from "./narration";
export * from "./executive-producer";
export * from "./script-supervisor";
export * from "./cinematographer";
export * from "./storyboard";
