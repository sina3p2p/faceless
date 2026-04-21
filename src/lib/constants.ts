// ─────────────────────────────────────────────────────────
// Central configuration — all settings and env vars in one place
// ─────────────────────────────────────────────────────────

import type { FalVideoProfile } from "@/types/video-provider";

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
  defaultModel: "anthropic/claude-opus-4.6",
  fallbackModel: "openai/gpt-4.1",
  visionModel: "google/gemini-2.5-pro",
  producerModel: "anthropic/claude-sonnet-4",
  storyModel: "anthropic/claude-opus-4.6",
  directorModel: "anthropic/claude-opus-4.6",
  supervisorModel: "anthropic/claude-sonnet-4",
  cinematographerModel: "openai/gpt-5.4",
  storyboardModel: "openai/gpt-4.1-mini",
  promptModel: "openai/gpt-5.4",
  motionModel: "openai/gpt-5.4",
} as const;

export const LLM_MODELS = [
  { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6", description: "Best quality, higher cost (~$0.04/script)" },
  { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", description: "Great quality, moderate cost (~$0.02/script)" },
  { id: "openai/gpt-4.1", label: "GPT-4.1", description: "Good quality, lower cost (~$0.01/script)" },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini", description: "Decent quality, cheapest (~$0.003/script)" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Great quality, competitive cost (~$0.02/script)" },
] as const;

export const DEFAULT_LLM_MODEL = LLM.defaultModel;

// ── TTS (ElevenLabs) ──

export const TTS = {
  get apiKey() { return env("ELEVENLABS_API_KEY"); },
  get defaultVoiceId() { return env("ELEVENLABS_DEFAULT_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"); },
  model: "eleven_multilingual_v2",
  defaultStability: 0.4,
  defaultSimilarityBoost: 0.8,
  defaultStyle: 0.3,
} as const;

// ── Media (OpenAI + Kling image API) ──

export const MEDIA = {
  get openaiApiKey() { return env("OPENAI_API_KEY"); },
} as const;

// ── AI Video (image-to-video only — routed through Fal; Kling keys below are for still-image generation) ──

export const AI_VIDEO = {
  get falKey() { return env("FAL_KEY"); },
  get klingAccessKey() { return env("PROVIDER_KLING_ACCESS_KEY"); },
  get klingSecretKey() { return env("PROVIDER_KLING_SECRET_KEY"); },
  /** Kling API host (global Singapore region default). */
  get klingBaseUrl() { return env("PROVIDER_KLING_API_BASE", "https://api-singapore.klingai.com"); },
  /** Kling text-to-image when no character references. */
  klingImageModelDefault: "kling-v2",
  /** Kling omni image when using reference images / elements. */
  klingImageModelOmni: "kling-image-o1",
} as const;

// ── Music (Suno) ──

export const MUSIC = {
  get sunoApiKey() { return env("SUNO_API_KEY"); },
  sunoBaseUrl: "https://api.sunoapi.org",
  sunoModel: "V5" as const,
} as const;

type VideoModelEntry = {
  id: string;
  label: string;
  description: string;
  falEndpoint: string;
  falProfile: FalVideoProfile;
  durations: readonly number[];
  endFrame: boolean;
  durationFormat: "string" | "number";
  falLumaResolution?: "540p" | "720p" | "1080p";
  falVeoResolution?: "720p" | "1080p" | "4k";
  falKlingGenerateAudio?: boolean;
  falSeedanceResolution?: "480p" | "720p" | "1080p";
  falSeedanceGenerateAudio?: boolean;
};

const SEEDANCE2_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export const VIDEO_MODELS: readonly VideoModelEntry[] = [
  {
    id: "seedance-2-pro",
    label: "Seedance 2 Pro",
    falEndpoint: "bytedance/seedance-2.0/image-to-video",
    falProfile: "seedance2",
    falSeedanceResolution: "720p",
    falSeedanceGenerateAudio: false,
    description: "ByteDance Seedance 2.0 i2v on Fal (4–15s, optional last frame, up to 1080p)",
    durations: SEEDANCE2_DURATIONS,
    endFrame: true,
    durationFormat: "number",
  },
  {
    id: "seedance-2-fast",
    label: "Seedance 2 Fast",
    falEndpoint: "bytedance/seedance-2.0/fast/image-to-video",
    falProfile: "seedance2_fast",
    falSeedanceResolution: "720p",
    falSeedanceGenerateAudio: false,
    description: "Seedance 2.0 Fast on Fal — lower latency; 480p/720p only on API",
    durations: SEEDANCE2_DURATIONS,
    endFrame: true,
    durationFormat: "number",
  },
  {
    id: "runway-gen4-turbo",
    label: "Runway Gen-4 Turbo",
    falEndpoint: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    falProfile: "luma_ray2",
    falLumaResolution: "720p",
    description: "Strong motion quality (via Fal — Luma Ray 2), 5s or 9s",
    durations: [5, 9],
    endFrame: false,
    durationFormat: "number",
  },
  {
    id: "runway-gen4.5",
    label: "Runway Gen-4.5",
    falEndpoint: "fal-ai/luma-dream-machine/ray-2/image-to-video",
    falProfile: "luma_ray2",
    falLumaResolution: "1080p",
    description: "Premium motion (via Fal — Luma Ray 2 @ 1080p), 5s or 9s",
    durations: [5, 9],
    endFrame: false,
    durationFormat: "number",
  },
  {
    id: "grok-imagine",
    label: "Grok Imagine Video",
    falEndpoint: "xai/grok-imagine-video/image-to-video",
    falProfile: "grok_imagine",
    description: "xAI Grok Imagine i2v with audio (via Fal), 1–15s",
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrame: false,
    durationFormat: "number",
  },
  {
    id: "veo-31-lite",
    label: "Veo 3.1 Lite",
    falEndpoint: "fal-ai/veo3.1/image-to-video",
    falProfile: "veo31",
    falVeoResolution: "720p",
    description: "Google Veo 3.1 i2v (via Fal), 720p, 4s / 6s / 8s",
    durations: [4, 6, 8],
    endFrame: false,
    durationFormat: "number",
  },
  {
    id: "veo-31-fast",
    label: "Veo 3.1 Fast",
    falEndpoint: "fal-ai/veo3.1/image-to-video",
    falProfile: "veo31",
    falVeoResolution: "1080p",
    description: "Google Veo 3.1 i2v (via Fal), 1080p, 4s / 6s / 8s",
    durations: [4, 6, 8],
    endFrame: false,
    durationFormat: "number",
  },
  {
    id: "kling-3-standard",
    label: "Kling 3.0 Standard",
    falEndpoint: "fal-ai/kling-video/v1.6/pro/image-to-video",
    falProfile: "kling_v16_tail",
    description: "Kling i2v with optional last frame (via Fal — v1.6 pro)",
    durations: [5, 10],
    endFrame: true,
    durationFormat: "string",
  },
  {
    id: "kling-3-pro",
    label: "Kling 3.0 Pro",
    falEndpoint: "fal-ai/kling-video/v2.1/master/image-to-video",
    falProfile: "kling_v21_master",
    description: "Kling master-quality i2v (via Fal — v2.1 master)",
    durations: [5, 10],
    endFrame: false,
    durationFormat: "string",
  },
  {
    id: "kling-o3",
    label: "Kling O3",
    falEndpoint: "fal-ai/kling-video/v2.6/pro/image-to-video",
    falProfile: "kling_v26",
    falKlingGenerateAudio: true,
    description: "Kling v2.6 with native audio (via Fal)",
    durations: [5, 10],
    endFrame: true,
    durationFormat: "string",
  },
];

export const DEFAULT_VIDEO_MODEL = "kling-3-standard";

export const IMAGE_MODELS = [
  { id: "dall-e-3", label: "DALL-E 3", description: "Good quality, ~$0.04/image (OpenAI)" },
  { id: "gpt-image-1.5", label: "GPT Image 1.5", description: "Best OpenAI image model, instruction-following (OpenAI)" },
  { id: "kling-image-v3", label: "Kling Image V3", description: "Excellent quality, character refs, ~$0.028/image" },
  { id: "nano-banana-2", label: "Nano Banana 2", description: "High quality, character consistency, ~$0.04/image (Gemini)" },
  { id: "nano-banana-pro", label: "Nano Banana Pro", description: "High quality, character consistency, ~$0.04/image (Gemini)" },
] as const;

export const DEFAULT_IMAGE_MODEL = "dall-e-3";

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
] as const;

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
  { id: "dialogue", label: "Dialogue", description: "Conversational story between characters with different voices" },
] as const;
