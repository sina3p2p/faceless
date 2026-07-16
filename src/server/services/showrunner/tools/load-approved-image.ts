import { tool } from "ai";
import { z } from "zod";
import { mediaUrl } from "@/lib/storage";

/**
 * On-demand vision for approved stills that fell outside the history vision
 * window (last N images). Returns multimodal tool output for the current turn only.
 */
export const loadApprovedImage = tool({
  description:
    "Load one approved reference / continuity keyframe / generation-grid / last-frame " +
    "image into vision for this turn. Conversation history only auto-attaches the last " +
    "few images; call this when you need to visually inspect an older approved URL from " +
    "the thread. Pass a single URL or storage key. Prefer at most 2 calls per turn.",
  inputSchema: z.object({
    url: z
      .string()
      .describe("Approved image URL or storage key from the conversation"),
    label: z
      .string()
      .optional()
      .describe('Optional short label, e.g. asset handle "@hero_charsheet"'),
  }),
  execute: async ({
    url,
    label,
  }: {
    url: string;
    label?: string;
  }) => {
    const resolved = await mediaUrl(url.trim());
    if (!resolved) {
      return {
        type: "text" as const,
        value: `Could not resolve image URL: ${url}`,
      };
    }
    const text = label?.trim()
      ? `Loaded image "${label.trim()}": ${resolved}`
      : `Loaded image: ${resolved}`;
    return {
      type: "content" as const,
      value: [
        { type: "text" as const, text },
        { type: "image-url" as const, url: resolved },
      ],
    };
  },
});
