import { TTS } from "@/lib/constants";

interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string;
  wordTimestamps: WordTimestamp[];
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

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": TTS.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
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
