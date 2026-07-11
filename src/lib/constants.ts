// ─────────────────────────────────────────────────────────
// Central configuration — all settings and env vars in one place
// ─────────────────────────────────────────────────────────

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

const SEEDANCE2_DURATIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

export const VIDEO_MODELS: Partial<Record<TVideoModelId, TVideoModel>> = {
  "seedance-2-pro": {
    id: "seedance-2-pro",
    label: "Seedance 2 Pro",
    supportedResolution: ["480p", "720p", "1080p"],
    description: "ByteDance Seedance 2.0 i2v on Fal (4–15s, optional last frame, up to 1080p)",
    durations: SEEDANCE2_DURATIONS,
    endFrameSupported: true,
    supportsAudio: true,
  },
  "seedance-2-fast": {
    id: "seedance-2-fast",
    label: "Seedance 2 Fast",
    supportedResolution: ["480p", "720p"],
    description: "Seedance 2.0 Fast on Fal — lower latency; 480p/720p only on API",
    durations: SEEDANCE2_DURATIONS,
    endFrameSupported: true,
    supportsAudio: true,
  },
  "seedance-2-mini": {
    id: "seedance-2-mini",
    label: "Seedance 2 Mini",
    supportedResolution: ["480p", "720p"],
    description: "Seedance 2.0 Mini on Fal — lower latency; 480p/720p only on API",
    durations: SEEDANCE2_DURATIONS,
    endFrameSupported: true,
    supportsAudio: true,
  },
  "kling-v2.5-turbo-pro": {
    id: "kling-v2.5-turbo-pro",
    label: "Kling V2.5 Turbo Pro",
    supportedResolution: [],
    description: "Kling V2.5 Turbo Pro on Fal — higher quality; 5s / 10s",
    durations: [5, 10],
    endFrameSupported: true,
  },
  "grok-imagine": {
    id: "grok-imagine",
    label: "Grok Imagine Video",
    supportedResolution: ["480p", "720p"],
    description: "xAI Grok Imagine i2v with audio (via Fal), 1–15s",
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrameSupported: false,
  },
  "veo-31-lite": {
    id: "veo-31-lite",
    label: "Veo 3.1 Lite",
    supportedResolution: ["720p", "1080p", "4k"],
    description: "Google Veo 3.1 i2v (via Fal), 720p, 4s / 6s / 8s",
    durations: [4, 6, 8],
    endFrameSupported: false,
  },
  "veo-31-fast": {
    id: "veo-31-fast",
    label: "Veo 3.1 Fast",
    supportedResolution: ["720p", "1080p", "4k"],
    description: "Google Veo 3.1 i2v (via Fal), 1080p, 4s / 6s / 8s",
    durations: [4, 6, 8],
    endFrameSupported: false,
  },
  "kling-3-standard": {
    id: "kling-3-standard",
    label: "Kling 3.0 Standard",
    supportedResolution: [],
    description: "Kling i2v with optional last frame (via Fal — v1.6 pro)",
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrameSupported: true,
  },
  "kling-3-pro": {
    id: "kling-3-pro",
    label: "Kling 3.0 Pro",
    supportedResolution: [],
    description: "Kling master-quality i2v (via Fal — v2.1 master)",
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    endFrameSupported: false,
  },
};

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

// ── AI Video (image-to-video) ──

export const AI_VIDEO = {
  get falKey() { return env("FAL_KEY"); },
  get replicateToken() { return env("REPLICATE_API_TOKEN"); },
  get kieApiKey() { return env("KIE_API_KEY"); },
} as const;

// ── Music (Suno) ──

export const MUSIC = {
  get sunoApiKey() { return env("SUNO_API_KEY"); },
  sunoBaseUrl: "https://api.sunoapi.org",
  sunoModel: "V5" as const,
} as const;

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
