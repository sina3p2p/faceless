import { tool } from "ai";
import { z } from "zod";
import { agentMediaUrl } from "@/lib/storage";

/**
 * On-demand vision for approved stills that fell outside the history vision
 * window (last N non-pinned images). Returns multimodal tool output for the
 * current turn; pass pin:true for identity assets so replay keeps the pixels.
 */
export const loadApprovedImage = tool({
  description:
    "Load one approved reference image, motion sheet, scene/incoming/match-cut anchor, or last-frame " +
    "still into vision for this turn. Conversation history only auto-attaches recent non-pinned images; " +
    "call this when you need to visually inspect an older URL. Pass pin:true for identity assets " +
    "(charsheets, plates, hero props) so they stay attached across turns. Prefer at most 2 calls per turn. " +
    "If the result says vision_status:unverifiable, do NOT claim a visual check passed.",
  inputSchema: z.object({
    url: z
      .string()
      .describe("Approved image URL or storage key from the conversation"),
    label: z
      .string()
      .optional()
      .describe('Optional short label, e.g. asset handle "@hero_charsheet"'),
    pin: z
      .boolean()
      .optional()
      .describe(
        "When true, keep this image attached across history replay (use for identity assets). Default false."
      ),
  }),
  execute: async ({
    url,
    label,
    pin,
  }: {
    url: string;
    label?: string;
    pin?: boolean;
  }) => {
    const resolved = agentMediaUrl(url.trim());
    if (!resolved) {
      return {
        type: "text" as const,
        value: `vision_status:unverifiable — Could not resolve image URL: ${url}`,
      };
    }
    const pinNote = pin ? " (pinned)" : "";
    const text = label?.trim()
      ? `vision_status:attached${pinNote} — Loaded image "${label.trim()}": ${resolved}`
      : `vision_status:attached${pinNote} — Loaded image: ${resolved}`;
    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text },
        { type: "image-url" as const, url: resolved },
      ],
    };
  },
});
