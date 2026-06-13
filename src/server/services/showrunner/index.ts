import { tool } from "ai";
import { z } from "zod";
import { openrouter } from "@/server/services/ai/llm/index";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve, normalize } from "node:path";

export const MODEL = "anthropic/claude-sonnet-4.6";

const SKILLS_BASE = resolve(process.cwd(), "src/server/prompts/skills");

// Auto-executed tool — SDK handles the round-trip transparently.
// maxSteps must be > 1 in streamText for the LLM to see and respond to the result.
const loadReference = tool({
  description:
    "Read a detailed reference file from the skill. Call this when the " +
    "instructions tell you to consult a references/ file (e.g. " +
    "'see references/deliverable-templates.md'). Returns that file's full text.",
  inputSchema: z.object({
    file: z.enum([
      "pipeline-steps.md",
      "deliverable-templates.md",
      "medium-constraints.md",
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

export const storyTools = {
  loadReference,
  generateAssetReferences: tool({
    description:
      "Generate candidate reference images for ONE locked character or location asset. " +
      "Call this once per asset, one at a time — present an asset, wait for the user's " +
      "approval, then call again for the next asset. Never batch multiple assets in a single " +
      "turn. Only call once the Look block is locked.",
    inputSchema: z.object({
      assetHandle: z.string().describe('Named handle, e.g. "hero_charsheet" or "rooftop_plate"'),
      assetKind: z.enum(["character", "location"]),
      imagePrompt: z
        .string()
        .describe(
          "Full image generation prompt: expand the locked spec + the locked Look block into a single self-contained prompt ready for an image model."
        ),
    }),
  }),
  presentFork: tool({
    description:
      "Present a set of distinct creative options to the collaborator at a decision point. " +
      "Call this after your narrative introduction for each step. " +
      "Provide as many genuinely distinct options as the step warrants — typically 4–6 for " +
      "open steps like premise, fewer for binary taste forks. " +
      "Options must represent genuinely different directions — not variations of the same idea. " +
      "Never drop or merge options to fit a count; present every distinct direction you generated. " +
      "You MUST call this tool to present options; never list them in plain text, and never " +
      "mention this tool, its limits, or your option-count reasoning in your visible message.",
    inputSchema: z.object({
      options: z
        .array(
          z.object({
            id: z.string().describe("Single uppercase letter: A, B, C, D, E, or F"),
            label: z.string().describe("3–5 word title for this option"),
            content: z.string().describe("The actual content — what is locked if chosen"),
            tradeoffs: z.string().describe("One sentence: what this gains and what it sacrifices"),
          })
        )
        .min(2)
        .max(6),
      recommendedId: z.string().describe("Which option letter you recommend"),
      recommendationReason: z
        .string()
        .describe("One sentence explaining why you recommend this option"),
    }),
  }),
};


export { openrouter };
