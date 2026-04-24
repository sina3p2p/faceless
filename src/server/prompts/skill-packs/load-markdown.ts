import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseSkillMarkdown } from "./parse-frontmatter";

const CONTENT_DIR = path.join(process.cwd(), "src/server/prompts/skill-packs/content");

const FILENAMES = [
  "reference-discipline",
  "first-seconds-hooks",
  "camera-phrase-bank",
  "music-sections",
  "energy-ladder",
  "vertical-packs",
  "style-modes-01-15",
  "lighting-sound-pacing",
] as const;

export type SkillContentFile = (typeof FILENAMES)[number];

const cache: Partial<Record<SkillContentFile, string>> = {};

function readFileBody(name: SkillContentFile): string {
  const file = path.join(CONTENT_DIR, `${name}.md`);
  if (!existsSync(file)) {
    console.warn(`[skill-packs] Missing ${file}; skill prose omitted.`);
    return "";
  }
  const raw = readFileSync(file, "utf8");
  return parseSkillMarkdown(raw).body;
}

/** Cached markdown bodies (server / worker only). */
export function getSkillContentFile(key: SkillContentFile): string {
  if (cache[key]) return cache[key]!;
  const body = readFileBody(key);
  cache[key] = body;
  return body;
}

/** Test helper. */
export function clearSkillContentCache() {
  for (const k of Object.keys(cache)) {
    delete cache[k as SkillContentFile];
  }
}
