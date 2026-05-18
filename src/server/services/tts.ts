import { TTS } from "@/lib/constants";
import type { TTSResult, WordTimestamp } from "@/types/tts";
import { translatePauseMarkersToSsml } from "./ai/llm/pacing";

export type { TTSResult, WordTimestamp };

interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  /** Used only when the v3 expressive model is enabled — selects an audio tag. */
  emotion?: string | null;
  emotionIntensity?: string | null;
}

export type EmotionVoiceSettings = Pick<
  TTSOptions,
  "stability" | "similarityBoost" | "style"
>;

/** Per-scene TTS overrides: voice settings plus emotion (for v3 audio tags). */
export type PerSceneTTSOptions = EmotionVoiceSettings &
  Pick<TTSOptions, "emotion" | "emotionIntensity">;

// ElevenLabs v3 inline audio tags per emotion. Empty = no tag (neutral).
const EMOTION_V3_TAG: Record<string, string> = {
  neutral: "",
  joyful: "[happy]",
  sad: "[sad]",
  angry: "[angry]",
  fearful: "[nervous]",
  tender: "[gentle]",
  tense: "[urgent]",
  triumphant: "[triumphant]",
  playful: "[playful]",
  cold: "[cold]",
  anxious: "[nervous]",
  hopeful: "[hopeful]",
  desperate: "[desperate]",
  sarcastic: "[sarcastic]",
  awe: "[whispering]",
  grief: "[crying]",
  rage: "[shouting]",
  warm: "[warm]",
  resigned: "[sighs]",
  manic: "[frantic]",
};

// `emotion:intensity` → escalated tag. Strong feelings push past the base tag
// into a performed extreme so the climax of a movie actually lands.
const EMOTION_INTENSITY_TAG: Record<string, string> = {
  "angry:strong": "[shouting]",
  "rage:strong": "[screaming]",
  "grief:strong": "[sobbing]",
  "sad:strong": "[crying]",
  "joyful:strong": "[laughing]",
  "fearful:strong": "[terrified]",
  "desperate:strong": "[pleading]",
  "manic:strong": "[laughing]",
};

/** Inline v3 audio tag for an emotion; strong feelings escalate the tag. */
export function emotionToV3Tag(
  emotion?: string | null,
  intensity?: string | null
): string {
  const key = emotion?.toLowerCase() ?? "";
  const escalated = EMOTION_INTENSITY_TAG[`${key}:${intensity ?? ""}`];
  if (escalated) return escalated;
  return EMOTION_V3_TAG[key] ?? "";
}

// Base ElevenLabs v2 voice_settings per emotion. Lower `stability` = more
// expressive variance; higher `style` = more performed/exaggerated delivery.
const EMOTION_SETTINGS: Record<string, { stability: number; style: number }> = {
  neutral: { stability: 0.5, style: 0.2 },
  joyful: { stability: 0.3, style: 0.55 },
  sad: { stability: 0.32, style: 0.35 },
  angry: { stability: 0.22, style: 0.6 },
  fearful: { stability: 0.25, style: 0.5 },
  tender: { stability: 0.4, style: 0.35 },
  tense: { stability: 0.28, style: 0.5 },
  triumphant: { stability: 0.28, style: 0.6 },
  playful: { stability: 0.3, style: 0.55 },
  cold: { stability: 0.5, style: 0.4 },
  anxious: { stability: 0.26, style: 0.5 },
  hopeful: { stability: 0.36, style: 0.45 },
  desperate: { stability: 0.2, style: 0.62 },
  sarcastic: { stability: 0.42, style: 0.55 },
  awe: { stability: 0.4, style: 0.4 },
  grief: { stability: 0.22, style: 0.45 },
  rage: { stability: 0.18, style: 0.7 },
  warm: { stability: 0.42, style: 0.35 },
  resigned: { stability: 0.5, style: 0.3 },
  manic: { stability: 0.2, style: 0.7 },
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/**
 * Map a scene's emotion + intensity to ElevenLabs v2 voice_settings so the
 * delivery is acted, not flat. Unknown/empty emotion → neutral baseline.
 */
export function emotionToVoiceSettings(
  emotion?: string | null,
  intensity?: string | null
): EmotionVoiceSettings {
  const base = EMOTION_SETTINGS[emotion?.toLowerCase() ?? ""] ?? EMOTION_SETTINGS.neutral;
  let { stability, style } = base;
  if (intensity === "subtle") {
    stability += 0.12;
    style -= 0.12;
  } else if (intensity === "strong") {
    stability -= 0.1;
    style += 0.12;
  }
  return {
    stability: clamp(stability, 0.15, 0.7),
    style: clamp(style, 0, 0.85),
    similarityBoost: 0.8,
  };
}

/** ElevenLabs character-level alignment payload (`with-timestamps` responses). */
export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/**
 * Fold ElevenLabs char-level alignment into word timestamps. Returns [] when
 * alignment is absent (v3 may omit it) so callers degrade gracefully instead
 * of crashing. Shared by single-voice TTS and the v3 dialogue path.
 */
export function charsToWords(
  alignment: ElevenLabsAlignment | null | undefined
): WordTimestamp[] {
  const wordTimestamps: WordTimestamp[] = [];
  if (!alignment) return wordTimestamps;

  const {
    characters,
    character_start_times_seconds,
    character_end_times_seconds,
  } = alignment;

  let currentWord = "";
  let wordStart = -1;
  let wordEnd = 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const startTime = character_start_times_seconds[i];
    const endTime = character_end_times_seconds[i];

    if (char === " " || char === "\n") {
      if (currentWord.trim()) {
        wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: wordEnd });
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
    wordTimestamps.push({ word: currentWord.trim(), start: wordStart, end: wordEnd });
  }

  return wordTimestamps;
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
    emotion,
    emotionIntensity,
  } = options;

  // [pause:N] markers persist in scene text so we can swap TTS providers
  // without rewriting stored data. Convert to ElevenLabs SSML at send time.
  let requestText = translatePauseMarkersToSsml(text);

  // v3 trial: prepend an inline emotion audio tag so the line is performed.
  // v2 does NOT understand tags (it would speak them), so this is gated.
  if (TTS.useExpressiveV3) {
    const tag = emotionToV3Tag(emotion, emotionIntensity);
    if (tag) requestText = `${tag} ${requestText}`;
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
        text: requestText,
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

  const data = await response.json();

  const audioBase64: string = data.audio_base64;
  const audioBuffer = Buffer.from(audioBase64, "base64");

  if (!data.alignment && TTS.useExpressiveV3) {
    console.warn(
      "[tts] v3 expressive model returned no alignment — word-timestamp captions will be degraded for this scene."
    );
  }

  const wordTimestamps = charsToWords(data.alignment);

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
