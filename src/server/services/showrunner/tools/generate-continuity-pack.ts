import { tool } from "ai";
import { z } from "zod";
import { generateImage } from "@/server/services/media";
import { mediaUrl } from "@/lib/storage";

const notesSchema = z.object({
  roomGeography: z
    .string()
    .describe("Walls, exits, landmark sides, depth planes — fixed for the scene."),
  characterBlocking: z
    .string()
    .describe("Who starts where; who moves; who stays."),
  cameraAxis: z
    .string()
    .describe("Camera left/right; 180° line."),
  lightingProgression: z
    .string()
    .describe(
      "Ordered lighting states across this scene's generations (each generation still has ONE state)."
    ),
  screenDirection: z
    .string()
    .describe("Exits/entries and eyelines."),
  fixedProps: z
    .string()
    .describe("Props that must not teleport across the scene."),
});

const keyframeSchema = z.object({
  role: z
    .enum(["establishing", "blocking", "eyeline_props", "other"])
    .describe("What this keyframe locks visually."),
  caption: z
    .string()
    .describe("Short label shown under the keyframe (blocking / geography note)."),
  imagePrompt: z
    .string()
    .describe(
      "Self-contained photoreal still prompt for THIS keyframe only — not a multi-shot sequence. Honor notes + Look + approved character/location refs."
    ),
});

const generateContinuityPackInputSchema = z.object({
  sceneId: z.union([z.string(), z.number()]).describe("Scene id/number this pack belongs to"),
  packHandle: z
    .string()
    .describe('Named handle, e.g. "@scene3_continuity"'),
  notes: notesSchema.describe("Structured continuity notes — required, locked with the visuals."),
  keyframes: z
    .array(keyframeSchema)
    .min(1)
    .max(3)
    .describe(
      "1–3 sparse visual keyframes (establishing + key blocking/eyeline/prop geography). NOT a Seedance shot sequence."
    ),
  referenceImageUrls: z
    .array(z.string())
    .describe("Approved character + location (+ object) refs for this scene, in citation order."),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1"])
    .default("16:9")
    .describe("Film's locked aspect ratio — keyframes render in the film's true ratio."),
});

export type GenerateContinuityPackInput = z.infer<typeof generateContinuityPackInputSchema>;
export type ContinuityPackNotes = z.infer<typeof notesSchema>;

export function validateContinuityPackKeyframes(
  keyframes: { role: string; caption: string; imagePrompt: string }[] | undefined
): string | null {
  if (!keyframes || keyframes.length < 1 || keyframes.length > 3) {
    return "keyframes is required and must contain 1–3 entries";
  }
  for (const [i, kf] of keyframes.entries()) {
    if (!kf.imagePrompt?.trim()) return `keyframes[${i}].imagePrompt is required`;
    if (!kf.caption?.trim()) return `keyframes[${i}].caption is required`;
  }
  return null;
}

export const generateContinuityPack = tool({
  description:
    "RETIRED — not registered on storyTools. Scene continuity is now the scene header's continuity " +
    "block (text) plus the first approved motion sheet as scene anchor. Kept only for legacy session " +
    "hydration / worker retries of old generateContinuityPack calls.",
  inputSchema: generateContinuityPackInputSchema,
});

/** Shared by chat route and retry-tool route. */
export async function generateContinuityPackImages(
  keyframes: { imagePrompt: string }[],
  referenceImageUrls: string[],
  aspectRatio: "16:9" | "9:16" | "1:1"
): Promise<string[]> {
  const imgs = await Promise.all(
    keyframes.map((kf) => generateImage({
      model: "gpt-image-2",
      prompt: kf.imagePrompt,
      referenceImages: referenceImageUrls,
      aspectRatio
    }))
  );
  return Promise.all(imgs.flat().map((img) => mediaUrl(img)));
}
