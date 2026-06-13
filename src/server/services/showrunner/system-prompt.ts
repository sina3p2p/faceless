import fs from "node:fs";
import path from "node:path";

function loadSkill(filePath: string): string {
  const raw = fs.readFileSync(path.join(process.cwd(), filePath), "utf-8");
  // Strip YAML frontmatter (--- ... ---)
  const withoutFrontmatter = raw.replace(/^---[\s\S]*?---\n?/, "");
  return withoutFrontmatter.trim();
}

export const AI_FILM_STAGE1_SKILL = loadSkill(
  "src/server/prompts/skills/ai-film-stage1/SKILL.md"
);
