import { tool } from "ai";
import { z } from "zod";

export const presentFork = tool({
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
});
