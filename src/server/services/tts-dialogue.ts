import { TTS } from "@/lib/constants";
import { emotionToV3Tag } from "./tts";
import { translatePauseMarkersToSsml } from "./ai/llm/pacing";

/** One spoken turn in a dialogue request (one movie scene). */
export interface DialogueTurn {
  text: string;
  voiceId: string;
  emotion?: string | null;
  emotionIntensity?: string | null;
}

export interface DialogueResult {
  audioBuffer: Buffer;
  contentType: string;
}

/**
 * ElevenLabs v3 Text-to-Dialogue: synthesize a multi-turn exchange in ONE
 * request so the model performs it with emotional turn-taking instead of
 * speaking each line in isolation. Returns one combined audio buffer; the
 * caller is responsible for slicing it back to per-scene segments.
 *
 * Emotion is injected the same way the single-voice v3 path does it — an
 * inline audio tag prepended to each turn's text (see `emotionToV3Tag`).
 */
export async function generateDialogue(
  turns: DialogueTurn[]
): Promise<DialogueResult> {
  if (turns.length === 0) throw new Error("generateDialogue: no turns");

  const inputs = turns.map((t) => {
    let text = translatePauseMarkersToSsml(t.text);
    const tag = emotionToV3Tag(t.emotion, t.emotionIntensity);
    if (tag) text = `${tag} ${text}`;
    return { text, voice_id: t.voiceId };
  });

  const response = await fetch("https://api.elevenlabs.io/v1/text-to-dialogue", {
    method: "POST",
    headers: {
      "xi-api-key": TTS.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      model_id: TTS.dialogModel,
      inputs,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs Text-to-Dialogue failed: ${response.status} ${response.statusText} - ${errBody}`
    );
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return { audioBuffer, contentType: "audio/mpeg" };
}
