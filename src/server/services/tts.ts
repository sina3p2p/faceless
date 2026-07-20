import { TTS } from "@/lib/constants";
import type { TTSResult } from "@/types/tts";

export type { TTSResult };

interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

/**
 * Synthesize speech via ElevenLabs. Used for Stage 1 character voice anchors
 * (Bible §2 `*_vo` handles) that Stage 2 attaches as Seedance reference audio.
 */
export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  const {
    voiceId = TTS.defaultVoiceId,
    stability = TTS.defaultStability,
    similarityBoost = TTS.defaultSimilarityBoost,
    style = TTS.defaultStyle,
  } = options;

  if (!TTS.apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set");
  }
  if (!text.trim()) {
    throw new Error("TTS text must be non-empty");
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": TTS.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: TTS.activeModel,
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
          style,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(
      `ElevenLabs TTS failed: ${response.status} ${response.statusText} - ${errBody}`
    );
  }

  const data = (await response.json()) as { audio_base64: string };
  return {
    audioBuffer: Buffer.from(data.audio_base64, "base64"),
    contentType: "audio/mpeg",
    wordTimestamps: [],
  };
}
