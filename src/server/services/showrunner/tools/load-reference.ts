import { tool } from "ai";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, normalize } from "node:path";

const SKILLS_BASE = resolve(process.cwd(), "src/server/prompts/skills");

const STAGE1_REFS = new Set([
  "pipeline-steps.md",
  "deliverable-templates.md",
  "medium-constraints.md",
  "grid-storyboards.md",
]);

const STAGE2_REFS = new Set(["shot-compilation-recipe.md"]);

function resolveReference(file: string): string | null {
  const safe = normalize(file);
  if (safe === "stage2-skill.md") {
    return resolve(join(SKILLS_BASE, "ai-film-stage2", "SKILL.md"));
  }
  if (STAGE1_REFS.has(safe)) {
    return resolve(join(SKILLS_BASE, "ai-film-stage1", "references", safe));
  }
  if (STAGE2_REFS.has(safe)) {
    return resolve(join(SKILLS_BASE, "ai-film-stage2", "references", safe));
  }
  return null;
}

export const loadReference = tool({
  description:
    "Read a detailed reference file from the skill. Call this when the " +
    "instructions tell you to consult a references/ file (e.g. " +
    "'see references/deliverable-templates.md'). Returns that file's full text. " +
    "Use stage2-skill.md only after Stage 1's Scene Grid Registry is complete and passing.",
  inputSchema: z.object({
    file: z
      .enum([
        "pipeline-steps.md",
        "deliverable-templates.md",
        "medium-constraints.md",
        "grid-storyboards.md",
        "stage2-skill.md",
        "shot-compilation-recipe.md",
      ])
      .describe("Reference filename, e.g. 'pipeline-steps.md' or 'stage2-skill.md'"),
  }),
  execute: async ({ file }: { file: string }) => {
    const target = resolveReference(file);
    if (!target || !target.startsWith(SKILLS_BASE + "/")) {
      return {
        type: "text" as const,
        value: `Access denied or unknown file: ${file}.`,
      };
    }
    if (!existsSync(target)) {
      return {
        type: "text" as const,
        value: `File not found: ${file}.`,
      };
    }
    const content = readFileSync(target, "utf-8");
    return { type: "text" as const, value: content };
  },
});
