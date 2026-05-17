import { TTS } from "@/lib/constants";
import type { TTSResult, WordTimestamp } from "@/types/tts";
import { translatePauseMarkersToSsml } from "./ai/llm/pacing";

export type { TTSResult, WordTimestamp };

interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

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

  // [pause:N] markers persist in scene text so we can swap TTS providers
  // without rewriting stored data. Convert to ElevenLabs SSML at send time.
  const requestText = translatePauseMarkersToSsml(text);

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": TTS.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: requestText,
        model_id: TTS.model,
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

  const data = await response.json();

  const audioBase64: string = data.audio_base64;
  const audioBuffer = Buffer.from(audioBase64, "base64");

  const wordTimestamps: WordTimestamp[] = [];

  if (data.alignment) {
    const { characters, character_start_times_seconds, character_end_times_seconds } = data.alignment;

    let currentWord = "";
    let wordStart = -1;
    let wordEnd = 0;

    for (let i = 0; i < characters.length; i++) {
      const char = characters[i];
      const startTime = character_start_times_seconds[i];
      const endTime = character_end_times_seconds[i];

      if (char === " " || char === "\n") {
        if (currentWord.trim()) {
          wordTimestamps.push({
            word: currentWord.trim(),
            start: wordStart,
            end: wordEnd,
          });
        }
        currentWord = "";
        wordStart = -1;
      } else {
        if (wordStart === -1) wordStart = startTime;
        wordEnd = endTime;
        currentWord += char;
      }
    }

    if (currentWord.trim()) {
      wordTimestamps.push({
        word: currentWord.trim(),
        start: wordStart,
        end: wordEnd,
      });
    }
  }

  return {
    audioBuffer,
    contentType: "audio/mpeg",
    wordTimestamps,
  };
}

export interface AvailableVoice {
  id: string;
  name: string;
  gender: "male" | "female" | null;
}

/** Fetch the ElevenLabs voice library (server-side; used for auto voice casting). */
export async function listVoices(): Promise<AvailableVoice[]> {
  if (!TTS.apiKey) return [];
  const res = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": TTS.apiKey },
    cache: "no-store",
  });
  if (!res.ok) {
    console.warn(`[tts] listVoices failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return (data.voices as Array<{ voice_id: string; name: string; labels?: Record<string, string> }>)
    .map((v) => {
      const g = v.labels?.gender?.toLowerCase();
      return {
        id: v.voice_id,
        name: v.name,
        gender: g === "male" || g === "female" ? (g as "male" | "female") : null,
      };
    });
}

export async function generateSpeechForScenes(
  scenes: Array<{ text: string }>,
  voiceId?: string
): Promise<TTSResult[]> {
  const results: TTSResult[] = [];
  for (const scene of scenes) {
    const result = await generateSpeech(scene.text, { voiceId });
    results.push(result);
  }
  return results;
}
