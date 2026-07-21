import { tool } from "ai";
import { z } from "zod";
import { agentMediaUrl } from "@/lib/storage";
import {
  findCanonicalKey,
  normalizeHandle,
} from "@/server/services/showrunner/handle-resolver";

/**
 * On-demand vision for approved stills that fell outside the history vision
 * window (last N non-pinned images). Returns multimodal tool output for the
 * current turn; pass pin:true for identity assets so replay keeps the pixels.
 *
 * Accepts a storage key / media URL, OR a named handle (e.g. @hero_charsheet)
 * which the app resolves to the canonical approved image for this session.
 */
export function createLoadApprovedImageTool(sessionId?: string) {
  return tool({
    description:
      "Load one approved reference image, motion sheet, scene/incoming/match-cut anchor, or last-frame " +
      "still into vision for this turn. Pass a named handle (e.g. @hero_charsheet) or a storage key / URL. " +
      "Conversation history only auto-attaches recent non-pinned images; call this when you need to " +
      "visually inspect an older image. Pass pin:true for identity assets (charsheets, plates, hero props) " +
      "so they stay attached across turns. Prefer at most 2 calls per turn. " +
      "If the result says vision_status:unverifiable, do NOT claim a visual check passed.",
    inputSchema: z.object({
      url: z
        .string()
        .describe(
          "Named handle (e.g. @hero_charsheet), approved image URL, or storage key"
        ),
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
      let keyOrUrl = url.trim();

      // Try handle resolution when the value looks like a bare handle
      const asHandle = normalizeHandle(keyOrUrl);
      if (asHandle && sessionId && !keyOrUrl.includes("/")) {
        const found = await findCanonicalKey(sessionId, asHandle);
        if (found) keyOrUrl = found;
      }

      const resolved = agentMediaUrl(keyOrUrl);
      if (!resolved) {
        return {
          type: "text" as const,
          value: `vision_status:unverifiable — Could not resolve image URL/handle: ${url}`,
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
}

export const loadApprovedImage = createLoadApprovedImageTool();
