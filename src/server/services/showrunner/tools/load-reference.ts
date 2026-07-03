import { tool } from "ai";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, normalize } from "node:path";

const SKILLS_BASE = resolve(process.cwd(), "src/server/prompts/skills");

// Auto-executed tool — SDK handles the round-trip transparently.
// maxSteps must be > 1 in streamText for the LLM to see and respond to the result.
export const loadReference = tool({
  description:
    "Read a detailed reference file from the skill. Call this when the " +
    "instructions tell you to consult a references/ file (e.g. " +
    "'see references/deliverable-templates.md'). Returns that file's full text.",
  inputSchema: z.object({
    file: z.enum([
      "pipeline-steps.md",
      "deliverable-templates.md",
      "medium-constraints.md",
      "shot-compilation-recipe.md",
    ]).describe("Relative path within the skills folder, e.g. 'references/pipeline-steps.md'"),
  }),
  execute: async ({ file }: { file: string }) => {
    // Prevent path traversal — resolve must stay inside SKILLS_BASE
    const target = resolve(join(SKILLS_BASE + "/ai-film-stage1/references", normalize(file)));
    if (!target.startsWith(SKILLS_BASE + "/")) {
      return { type: "text" as const, value: `Access denied: path must be inside the skills folder.` };
    }
    if (!existsSync(target)) {
      return {
        type: "text" as const,
        value: `File not found: ${file}. Create it at src/server/prompts/skills/ai-film-stage1/references/${file} to enable this reference.`,
      };
    }
    const content = readFileSync(target, "utf-8");
    return { type: "text" as const, value: content };
  },
});
