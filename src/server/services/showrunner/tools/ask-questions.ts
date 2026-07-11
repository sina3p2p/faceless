import { tool } from "ai";
import { z } from "zod";

export const askQuestions = tool({
  description:
    "Ask the collaborator one or more multiple-choice questions at a decision point. " +
    "Call this after your narrative introduction. Bundle 1–5 related questions in one call. " +
    "Each question needs short tap-label options that are genuinely distinct directions. " +
    "You MUST call this tool to ask; never list options in plain text, and never " +
    "mention this tool or your option-count reasoning in your visible message.",
  inputSchema: z.object({
    questions: z
      .array(
        z.object({
          question: z
            .string()
            .describe("Short decision question, e.g. 'Which shape should it be?'"),
          options: z
            .array(z.string())
            .min(2)
            .max(6)
            .describe(
              "Full tap labels for each option, e.g. '16:9 — widescreen, cinematic'"
            ),
          recommendedIndex: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("0-based index of the recommended option, if any"),
        })
      )
      .min(1)
      .max(5),
  }),
});
