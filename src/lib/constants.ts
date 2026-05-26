// ─────────────────────────────────────────────────────────
// Central configuration — all settings and env vars in one place
// ─────────────────────────────────────────────────────────

import { ModelSettings } from "@/types/llm-common";

export const env = (key: string, fallback = "") => process.env[key] || fallback;

// ── Database ──

export const DATABASE = {
  get url() { return process.env.DATABASE_URL!; },
} as const;

// ── Redis ──

export const REDIS = {
  get url() { return env("REDIS_URL", "redis://localhost:6379"); },
} as const;

// ── Auth (OAuth) ──

export const AUTH = {
  google: {
    get clientId() { return env("GOOGLE_CLIENT_ID"); },
    get clientSecret() { return env("GOOGLE_CLIENT_SECRET"); },
  },
  github: {
    get clientId() { return env("GITHUB_CLIENT_ID"); },
    get clientSecret() { return env("GITHUB_CLIENT_SECRET"); },
  },
} as const;

// ── LLM (OpenRouter) ──

export const LLM = {
  get apiKey() { return env("OPENROUTER_API_KEY"); },
  defaultModel: "anthropic/claude-opus-4.7",
} as const;

export const MODEL_SETTINGS: ModelSettings = {
  // Multimodal — needs to see images
  reviewerModel: "google/gemini-3.1-pro-preview",
  // Creative / narrative — needs deep reasoning and voice
  producerModel: "anthropic/claude-opus-4.7",
  storyModel: "anthropic/claude-opus-4.7",
  directorModel: "anthropic/claude-opus-4.7",
  // Analytical — continuity tracking, entity extraction
  supervisorModel: "anthropic/claude-sonnet-4.6",
  // Technical / precise structured output
  cinematographerModel: "openai/gpt-5.5",
  storyboardModel: "openai/gpt-5.5",
  promptModel: "openai/gpt-5.5",
  motionModel: "openai/gpt-5.5",
  // Fast extraction — cheap is fine
  researchModel: "openai/gpt-4.1-mini",
  // Media models
  videoModel: "seedance-2-pro",
  imageModel: "gpt-image-2",
}

export const LLM_MODELS: Record<LLMModelId, LLMModel> = {
  "anthropic/claude-opus-4.7": { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", description: "Newest Opus; best for complex scripts (~$0.04+/script)" },
  "anthropic/claude-opus-4.6": { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", description: "Best quality, higher cost (~$0.04/script)" },
  "anthropic/claude-sonnet-4.6": { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", description: "Great quality, moderate cost (~$0.02/script)" },
  "openai/gpt-5.5": { id: "openai/gpt-5.5", label: "GPT-5.5", description: "Latest GPT flagships; strong reasoning and long context" },
  "openai/gpt-4.1": { id: "openai/gpt-4.1", label: "GPT-4.1", description: "Good quality, lower cost (~$0.01/script)" },
  "openai/gpt-4.1-mini": { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", description: "Decent quality, cheapest (~$0.003/script)" },
  "google/gemini-2.5-pro": { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Great quality, competitive cost (~$0.02/script)" },
  "google/gemini-3.1-pro-preview": { id: "google/gemini-3.1-pro-preview", label: "Gemini 3 Pro", description: "Great quality, competitive cost (~$0.02/script)" },
};

export const IMAGE_MODELS: Record<TImageModelId, TImageModel> = {
  "gpt-image-1.5": { id: "gpt-image-1.5", label: "GPT Image 1.5", description: "Best OpenAI image model, instruction-following (OpenAI)" },
  "gpt-image-2": { id: "gpt-image-2", label: "GPT Image 2", description: "State-of-the-art OpenAI image generation, text and editing (OpenAI)" },
  "nano-banana-2": { id: "nano-banana-2", label: "Nano Banana 2", description: "High quality, character consistency, ~$0.04/image (Gemini)" },
  "nano-banana-pro": { id: "nano-banana-pro", label: "Nano Banana Pro", description: "High quality, character consistency, ~$0.04/image (Gemini)" },
  "seedream-5-lite": { id: "seedream-5-lite", label: "SeeDream 5 Lite", description: "ByteDance SeeDream 5 Lite — trusted by Seedance 2.0 moderation, reference image support (Replicate)" },
};

const SEEDANCE2_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
export const VIDEO_MODELS: Record<TVideoModelId, TVideoModel> = {
  "seedance-2-pro": {
    id: "seedance-2-pro",
    label: "Seedance 2 Pro",
    endpoint: "bytedance/seedance-2.0",
    provider: "replicate",
    supportedResolution: ["480p", "720p", "1080p"],
    description: "ByteDance Seedance 2.0 i2v on Fal (4–15s, optional last frame, up to 1080p)",
    durations: SEEDANCE2_DURATIONS,
    endFrameSupported: true,
    supportsAudio: true,
  },
  "seedance-2-fast": {
    id: "seedance-2-fast",
    label: "Seedance 2 Fast",
    endpoint: "bytedance/seedance-2.0/fast/image-to-video",
    provider: "replicate",
    supportedResolution: ["480p", "720p"],
    description: "Seedance 2.0 Fast on Fal — lower latency; 480p/720p only on API",
    durations: SEEDANCE2_DURATIONS,
    endFrameSupported: true,
    supportsAudio: true,
  },
  "kling-v2.5-turbo-pro": {
    id: "kling-v2.5-turbo-pro",
    label: "Kling V2.5 Turbo Pro",
    endpoint: "kwaivgi/kling-v2.5-turbo-pro",
    provider: "replicate",
    supportedResolution: [],
    description: "Kling V2.5 Turbo Pro on Fal — higher quality; 5s / 10s",
    durations: [5, 10],
    endFrameSupported: true,
  },
  "runway-gen4-turbo": {
    id: "runway-gen4-turbo",
    label: "Runway Gen-4 Turbo",
    endpoint: "fal-ai/luma-dream-machine/ray-2-flash/image-to-video",
    provider: "fal",
    supportedResolution: ["540p", "720p", "1080p"],
    description: "Strong motion quality (via Fal — Luma Ray 2), 5s or 9s",
    durations: [5, 9],
    endFrameSupported: false,
  },
  "runway-gen4.5": {
    id: "runway-gen4.5",
    label: "Runway Gen-4.5",
    endpoint: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    provider: "fal",
    supportedResolution: ["540p", "720p", "1080p"],
    description: "Premium motion (via Fal — Luma Ray 2 @ 1080p), 5s or 9s",
    durations: [5, 9],
    endFrameSupported: false,
  },
  "grok-imagine": {
    id: "grok-imagine",
    label: "Grok Imagine Video",
    endpoint: "xai/grok-imagine-video/image-to-video",
    provider: "fal",
    supportedResolution: ["480p", "720p"],
    description: "xAI Grok Imagine i2v with audio (via Fal), 1–15s",
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrameSupported: false,
  },
  "veo-31-lite": {
    id: "veo-31-lite",
    label: "Veo 3.1 Lite",
    endpoint: "fal-ai/veo3.1/image-to-video",
    provider: "fal",
    supportedResolution: ["720p", "1080p", "4k"],
    description: "Google Veo 3.1 i2v (via Fal), 720p, 4s / 6s / 8s",
    durations: [4, 6, 8],
    endFrameSupported: false,
  },
  "veo-31-fast": {
    id: "veo-31-fast",
    label: "Veo 3.1 Fast",
    endpoint: "fal-ai/veo3.1/fast/image-to-video",
    provider: "fal",
    supportedResolution: ["720p", "1080p", "4k"],
    description: "Google Veo 3.1 i2v (via Fal), 1080p, 4s / 6s / 8s",
    durations: [4, 6, 8],
    endFrameSupported: false,
  },
  "kling-3-standard": {
    id: "kling-3-standard",
    label: "Kling 3.0 Standard",
    endpoint: "fal-ai/kling-video/v3/standard/image-to-video",
    provider: "fal",
    supportedResolution: [],
    description: "Kling i2v with optional last frame (via Fal — v1.6 pro)",
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrameSupported: true,
  },
  "kling-3-pro": {
    id: "kling-3-pro",
    label: "Kling 3.0 Pro",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    provider: "fal",
    supportedResolution: [],
    description: "Kling master-quality i2v (via Fal — v2.1 master)",
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrameSupported: false,
  },
  "pixverse-v6": {
    id: "pixverse-v6",
    label: "Pixverse V6",
    endpoint: "pixverse/pixverse-v6",
    provider: "replicate",
    supportedResolution: ["360p", "540p", "720p", "1080p"],
    description: "Pixverse V6 i2v (via Replicate), 1–15s",
    durations: [5, 8, 10, 15],
    endFrameSupported: false,
  },
  "vidu-q3-pro": {
    id: "vidu-q3-pro",
    label: "Vidu Q3 Pro",
    endpoint: "vidu/q3-pro",
    provider: "replicate",
    supportedResolution: ["540p", "720p", "1080p"],
    description: "Vidu Q3 Pro i2v (via Replicate) — up to 16s, end-frame support, #2 globally",
    durations: [5, 8, 10, 16],
    endFrameSupported: true,
  },
};

export const DEFAULT_LLM_MODEL = LLM.defaultModel;

// ── TTS (ElevenLabs) ──

export const TTS = {
  get apiKey() { return env("ELEVENLABS_API_KEY"); },
  get defaultVoiceId() { return env("ELEVENLABS_DEFAULT_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"); },
  model: "eleven_multilingual_v2",
  /** Expressive model used when ELEVENLABS_USE_V3=true. Supports inline emotion audio tags. */
  expressiveModel: "eleven_v3",
  /**
   * Opt-in trial: route TTS through the expressive v3 model with inline
   * emotion audio tags. OFF by default — v3 may not return word-level
   * timestamps, so captions degrade gracefully (no crash) when enabled.
   */
  get useExpressiveV3() { return env("ELEVENLABS_USE_V3", "false") === "true"; },
  get activeModel() { return this.useExpressiveV3 ? this.expressiveModel : this.model; },
  /**
   * Kill-switch for the movie-type v3 Text-to-Dialogue path. ON by default;
   * set ELEVENLABS_DIALOG_ENABLED=false to force the legacy per-scene path.
   */
  get dialogEnabled() { return env("ELEVENLABS_DIALOG_ENABLED", "true") === "true"; },
  /** Model used for the v3 Text-to-Dialogue endpoint. */
  dialogModel: "eleven_v3",
  /** Max chars per dialogue request before a new group is started. */
  dialogMaxChars: 2800,
  /** Max turns per dialogue request before a new group is started. */
  dialogMaxTurns: 10,
  defaultStability: 0.4,
  defaultSimilarityBoost: 0.8,
  defaultStyle: 0.3,
} as const;

// ── Media (OpenAI + Kling image API) ──

export const MEDIA = {
  get openaiApiKey() { return env("OPENAI_API_KEY"); },
} as const;

// ── Web research (Tavily) ──

export const RESEARCH = {
  get tavilyApiKey() { return env("TAVILY_API_KEY"); },
  /** OpenRouter model for query planning + claim extraction (cheap / fast). */
} as const;

// ── AI Video (image-to-video) ──

export const AI_VIDEO = {
  get falKey() { return env("FAL_KEY"); },
  get replicateToken() { return env("REPLICATE_API_TOKEN"); },
} as const;


/**
 * Image-to-video backend: `"fal"` (Fal.ai) or `"replicate"` (Replicate for models with `replicateModel` in `VIDEO_MODELS`).
 * Change this value only — not exposed in the app UI. Rebuild after changing (client model list reads this at build time).
 */
export const VIDEO_I2V_PROVIDER: TVideoProviderId = "replicate";

// ── Music (Suno) ──

export const MUSIC = {
  get sunoApiKey() { return env("SUNO_API_KEY"); },
  sunoBaseUrl: "https://api.sunoapi.org",
  sunoModel: "V5" as const,
} as const;

export const IMAGE_MODEL_IDS = Object.keys(IMAGE_MODELS) as TImageModelId[]
export const LLM_MODEL_IDS = Object.keys(LLM_MODELS) as LLMModelId[];
export const VIDEO_MODEL_IDS = Object.keys(VIDEO_MODELS) as TVideoModelId[];

export function videoModelsForProvider(p: TVideoProviderId) {
  const models = Object.values(VIDEO_MODELS);
  if (p === "replicate") return models.filter((m) => m.provider === "replicate");
  return models;
}

export function videoResolutionsForModel(modelId: TVideoModelId): TVideoResolution[] {
  return VIDEO_MODELS[modelId]?.supportedResolution ?? [];
}

/** Highest tier listed last in each model's `supportedResolution`. */
export function getDefaultVideoResolution(modelId: TVideoModelId): TVideoResolution | undefined {
  const resolutions = videoResolutionsForModel(modelId);
  return resolutions.length ? resolutions[resolutions.length - 1] : undefined;
}

export function coerceVideoResolution(
  modelId: TVideoModelId,
  resolution: string | undefined | null
): TVideoResolution | undefined {
  const supported = videoResolutionsForModel(modelId);
  if (!supported.length) return undefined;
  if (resolution && supported.includes(resolution as TVideoResolution)) {
    return resolution as TVideoResolution;
  }
  return getDefaultVideoResolution(modelId);
}
// ── Storage (S3 / R2) ──

export const STORAGE = {
  get endpoint() { return env("S3_ENDPOINT") || undefined; },
  get region() { return env("S3_REGION", "auto"); },
  get accessKeyId() { return env("S3_ACCESS_KEY_ID"); },
  get secretAccessKey() { return env("S3_SECRET_ACCESS_KEY"); },
  get bucket() { return env("S3_BUCKET", "faceless-media"); },
  get r2PublicUrl() { return env("R2_PUBLIC_URL"); },
} as const;

// ── Stripe ──

export const STRIPE = {
  get secretKey() { return env("STRIPE_SECRET_KEY"); },
  get webhookSecret() { return env("STRIPE_WEBHOOK_SECRET"); },
  get priceIdStarter() { return env("STRIPE_PRICE_ID_STARTER"); },
  get priceIdPro() { return env("STRIPE_PRICE_ID_PRO"); },
} as const;

// ── App ──

export const APP = {
  get url() { return env("NEXT_PUBLIC_APP_URL", "http://localhost:3000"); },
  get serviceName() { return env("SERVICE_NAME", "faceless"); },
  get isProduction() { return process.env.NODE_ENV === "production"; },
  get isDevelopment() { return process.env.NODE_ENV === "development"; },
} as const;

// ── Worker ──

export const WORKER = {
  concurrency: 2,
  limiterMax: 4,
  limiterDuration: 60_000,
  parallelImages: 5,
  parallelVideos: 5,
  parallelTTS: 3,
  parallelFacelessMedia: 3,
} as const;

// ── Video Sizes ──

export const VIDEO_SIZES = [
  { id: "9:16", label: "Shorts / Reels (9:16)", width: 1080, height: 1920, orientation: "portrait" as const, dalleSize: "1024x1792" as const },
  { id: "16:9", label: "YouTube (16:9)", width: 1920, height: 1080, orientation: "landscape" as const, dalleSize: "1792x1024" as const },
  { id: "1:1", label: "Square (1:1)", width: 1080, height: 1080, orientation: "portrait" as const, dalleSize: "1024x1024" as const },
];

export const DEFAULT_VIDEO_SIZE = "9:16";

export type VideoSizeId = (typeof VIDEO_SIZES)[number]["id"];

export function getVideoSize(sizeId?: string | null) {
  return VIDEO_SIZES.find((s) => s.id === sizeId) ?? VIDEO_SIZES[0];
}

// ── Video Defaults ──

export const VIDEO_DEFAULTS = {
  width: 1080,
  height: 1920,
  fps: 30,
  minDuration: 30,
  maxDuration: 60,
} as const;

// ── Plan Limits ──

export const PLAN_LIMITS = {
  FREE: { videosPerMonth: 999999 },
  STARTER: { videosPerMonth: 999999 },
  PRO: { videosPerMonth: 999999 },
} as const;

// ── Queue ──

export const RENDER_QUEUE_NAME = "video-render";

// ── UI Options ──

export const NICHES = [
  { id: "history", label: "History", description: "Historical events and figures" },
  { id: "scary-stories", label: "Scary Stories", description: "Horror and creepy tales" },
  { id: "mythology", label: "Mythology", description: "Myths and legends from around the world" },
  { id: "anime-stories", label: "Anime Stories", description: "Anime-inspired narratives" },
  { id: "motivation", label: "Motivation", description: "Motivational stories and quotes" },
  { id: "kids", label: "Kids", description: "Fun educational stories for children" },
  { id: "news", label: "News & Geopolitics", description: "Current events, world politics, and breaking news" },
] as const;

export const ART_STYLES = [
  { id: "cinematic", label: "Cinematic" },
  { id: "anime", label: "Anime" },
  { id: "watercolor", label: "Watercolor" },
  { id: "dark", label: "Dark & Moody" },
  { id: "minimal", label: "Minimal" },
  { id: "cartoon", label: "Cartoon" },
  { id: "claymation", label: "Claymation 3D" },
  { id: "gothic-clay", label: "Gothic Clay" },
  { id: "pixar", label: "Pixar / 3D Render" },
  { id: "lego", label: "Lego Movie" },
] as const;

export const CAPTION_STYLES = [
  { id: "none", label: "None", description: "No captions / subtitles" },
  { id: "default", label: "Default", description: "Clean white text with shadow" },
  { id: "bold", label: "Bold Pop", description: "Large bold text with color highlights" },
  { id: "typewriter", label: "Typewriter", description: "Word-by-word reveal effect" },
  { id: "neon", label: "Neon Glow", description: "Glowing neon-style captions" },
] as const;

export const LANGUAGES = [
  { id: "en", label: "English", name: "English" },
  { id: "es", label: "Spanish (Español)", name: "Spanish" },
  { id: "fr", label: "French (Français)", name: "French" },
  { id: "de", label: "German (Deutsch)", name: "German" },
  { id: "pt", label: "Portuguese (Português)", name: "Portuguese" },
  { id: "it", label: "Italian (Italiano)", name: "Italian" },
  { id: "nl", label: "Dutch (Nederlands)", name: "Dutch" },
  { id: "ru", label: "Russian (Русский)", name: "Russian" },
  { id: "ja", label: "Japanese (日本語)", name: "Japanese" },
  { id: "ko", label: "Korean (한국어)", name: "Korean" },
  { id: "zh", label: "Chinese (中文)", name: "Chinese" },
  { id: "ar", label: "Arabic (العربية)", name: "Arabic" },
  { id: "fa", label: "Persian (فارسی)", name: "Persian" },
  { id: "tr", label: "Turkish (Türkçe)", name: "Turkish" },
  { id: "hi", label: "Hindi (हिन्दी)", name: "Hindi" },
  { id: "id", label: "Indonesian (Bahasa)", name: "Indonesian" },
  { id: "pl", label: "Polish (Polski)", name: "Polish" },
  { id: "sv", label: "Swedish (Svenska)", name: "Swedish" },
  { id: "th", label: "Thai (ไทย)", name: "Thai" },
  { id: "vi", label: "Vietnamese (Tiếng Việt)", name: "Vietnamese" },
] as const;

export const DEFAULT_LANGUAGE = "en";

export function getLanguageName(code: string): string {
  return LANGUAGES.find((l) => l.id === code)?.name ?? code;
}

export const VIDEO_TYPES = [
  { id: "standalone", label: "Standalone", description: "Story-driven video with AI-generated visuals and voiceover" },
  { id: "music_video", label: "Music Video", description: "AI-generated song with vocals + cinematic visuals (~$3-4/video)" },
  { id: "movie", label: "Movie", description: "Cinematic story from a prompt — narration, dialogue, or both as the story demands. Characters are generated automatically." },
  { id: "timelapse", label: "Timelapse", description: "Locked-vantage stage snapshots of a real-world process (construction, cleaning, growth) — one image per stage, animated with ambient motion." },
] as const;

/** Preset music genres for music videos — `style` is English text for the AI music generator (e.g. Suno). */
export const MUSIC_VIDEO_GENRES = [
  { id: "pop", label: "Pop", style: "pop, upbeat, catchy, radio-friendly vocals" },
  { id: "rap", label: "Hip-hop / Rap", style: "hip hop rap, rhythmic flow, modern beats, confident rap vocals" },
  { id: "kids", label: "Kids / Family", style: "kids music, cheerful, simple melody, playful, family-friendly vocals" },
  { id: "rock", label: "Rock", style: "rock, electric guitars, driving drums, powerful vocals" },
  { id: "rnb", label: "R&B / Soul", style: "R&B soul, smooth groove, warm bass, expressive vocals" },
  { id: "electronic", label: "Electronic / EDM", style: "electronic dance, synths, punchy beat, festival energy vocals" },
  { id: "country", label: "Country", style: "country, acoustic guitar, storytelling, heartfelt country vocals" },
  { id: "lofi", label: "Lo-fi", style: "lofi chill hop, mellow, soft drums, intimate relaxed vocals" },
  { id: "latin", label: "Latin", style: "latin pop, rhythmic percussion, danceable, vibrant vocals" },
  { id: "cinematic", label: "Cinematic / Epic", style: "cinematic orchestral, epic sweep, dramatic lead vocals" },
] as const;

export const DEFAULT_MUSIC_VIDEO_GENRE_ID = MUSIC_VIDEO_GENRES[0].id;

export function getMusicVideoGenreStyle(genreId: string): string {
  const g = MUSIC_VIDEO_GENRES.find((x) => x.id === genreId);
  return g?.style ?? MUSIC_VIDEO_GENRES[0].style;
}
