import { tool } from "ai";
import { z } from "zod";
import { generateSpeech } from "@/server/services/tts";
import { uploadFile, mediaUrl } from "@/lib/storage";
import { media } from "@/server/db/schema";
import { db } from "@/server/db";
import { TTS } from "@/lib/constants";
import type { GeneratedAssetItem } from "./generate-asset-references";
import {
  candidateKey,
  normalizeHandle,
} from "@/server/services/showrunner/handle-resolver";

const voiceSpecSchema = z.object({
  handle: z
    .string()
    .describe('Bible §2 voice handle, e.g. "hero_vo" or "narrator_vo"'),
  characterHandle: z
    .string()
    .optional()
    .describe('Linked image asset handle when applicable, e.g. "hero_charsheet"'),
  sampleText: z
    .string()
    .min(1)
    .describe(
      "Short in-character sample (1–2 sentences) that locks timbre and delivery — " +
        "not a full scene monologue."
    ),
  voiceId: z
    .string()
    .optional()
    .describe(
      "ElevenLabs voice_id. Omit to use the platform default. Prefer one distinct " +
        "voice per recurring speaking hero."
    ),
});

export type VoiceSpecInput = z.infer<typeof voiceSpecSchema>;

export const generateVoiceAnchors = tool({
  description:
    "Generate voice-anchor audio for recurring speaking characters (Stage 1, after Look / with " +
    "or after Step 9 image assets). Call ONCE with every Bible §2 Voices entry that speaks on " +
    "camera or as recurring VO. Each sample locks timbre for Seedance reference_audio. Presented " +
    "in the same asset gallery — wait for `asset_approval` (Approve remaining), never askQuestions. " +
    "Background one-off figures do not need voices.",
  inputSchema: z.object({
    voices: z
      .array(voiceSpecSchema)
      .min(1)
      .describe("Every speaking hero / recurring VO that needs a locked voice."),
  }),
});

/** Synthesize one voice sample as an asset-gallery row (kind: voice). */
export async function generateVoiceSample(
  spec: VoiceSpecInput,
  userId: string,
  sessionId: string
): Promise<GeneratedAssetItem & { sampleText: string }> {
  const voiceId = spec.voiceId?.trim() || TTS.defaultVoiceId;
  const result = await generateSpeech(spec.sampleText, { voiceId });
  const handle = normalizeHandle(spec.handle);
  if (!handle) {
    throw new Error(`Invalid voice handle "${spec.handle}" — must be @?[a-z0-9_]+`);
  }
  const key = candidateKey(sessionId, handle, "mp3");
  await uploadFile(key, result.audioBuffer, result.contentType);

  await db.insert(media).values({
    userId,
    type: "audio",
    url: key,
    prompt: spec.sampleText,
    modelUsed: TTS.activeModel,
    metadata: {
      handle: spec.handle,
      characterHandle: spec.characterHandle ?? null,
      voiceId,
    },
  });

  return {
    assetHandle: spec.handle,
    assetKind: "voice",
    sampleText: spec.sampleText,
    candidates: [{ id: key, url: await mediaUrl(key) }],
  };
}

export async function generateVoiceGallery(
  voices: VoiceSpecInput[],
  userId: string,
  sessionId: string
): Promise<Array<GeneratedAssetItem & { sampleText: string }>> {
  return Promise.all(
    voices.map((v) => generateVoiceSample(v, userId, sessionId))
  );
}
