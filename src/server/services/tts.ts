const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
const DEFAULT_VOICE_ID =
  process.env.ELEVENLABS_DEFAULT_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

interface TTSOptions {
  voiceId?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface TTSResult {
  audioBuffer: Buffer;
  contentType: string;
}

export async function generateSpeech(
  text: string,
  options: TTSOptions = {}
): Promise<TTSResult> {
  const {
    voiceId = DEFAULT_VOICE_ID,
    stability = 0.5,
    similarityBoost = 0.75,
  } = options;

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability,
          similarity_boost: similarityBoost,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs TTS failed: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    audioBuffer: Buffer.from(arrayBuffer),
    contentType: "audio/mpeg",
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
