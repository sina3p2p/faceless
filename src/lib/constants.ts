// ─────────────────────────────────────────────────────────
// Central configuration — all settings and env vars in one place
// ─────────────────────────────────────────────────────────

const env = (key: string, fallback = "") => process.env[key] || fallback;

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

// ── Media (Pexels + OpenAI) ──

export const MEDIA = {
  get pexelsApiKey() { return env("PEXELS_API_KEY"); },
  get openaiApiKey() { return env("OPENAI_API_KEY"); },
} as const;

// ── AI Video (fal.ai) ──

export const AI_VIDEO = {
  get falKey() { return env("FAL_KEY"); },
  i2vModel: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video" as string,
  t2vModel: "fal-ai/wan-25-preview/text-to-video" as string,
  fluxImageModel: "fal-ai/flux-pro/v1.1" as string,
} as const;

export const IMAGE_MODELS = [
  { id: "dall-e-3", label: "DALL-E 3", description: "Good quality, ~$0.04/image (OpenAI)" },
  { id: "flux-pro", label: "Flux Pro 1.1", description: "Best for 3D/claymation styles, ~$0.04/image (fal.ai)" },
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
} as const;

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
  { id: "pixar", label: "Pixar / 3D Render" },
] as const;

export const CAPTION_STYLES = [
  { id: "default", label: "Default", description: "Clean white text with shadow" },
  { id: "bold", label: "Bold Pop", description: "Large bold text with color highlights" },
  { id: "typewriter", label: "Typewriter", description: "Word-by-word reveal effect" },
  { id: "neon", label: "Neon Glow", description: "Glowing neon-style captions" },
] as const;

export const VIDEO_TYPES = [
  { id: "faceless", label: "Faceless", description: "Stock footage and AI images with voiceover" },
  { id: "ai_video", label: "AI Video", description: "AI-generated animated video clips per scene (higher cost)" },
] as const;
