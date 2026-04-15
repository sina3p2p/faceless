import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  pgEnum,
  json,
  real,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { ImageSpec } from "@/server/services/llm/image-spec";
import type { FrameMotionSpec } from "@/server/services/llm/motion";
import type { ResultMeta } from "@/server/services/llm/prompt-contract";

// ── Enums ──

export const planTierEnum = pgEnum("plan_tier", ["FREE", "STARTER", "PRO"]);

export const videoStatusEnum = pgEnum("video_status", [
  "PENDING",
  // Phase 1: Story
  "PRODUCING",
  "STORY",
  "SCENE_SPLIT",
  "SCRIPT_SUPERVISION",
  "REVIEW_STORY",
  // Phase 2: Pre-production
  "TTS_GENERATION",
  "CINEMATOGRAPHY",
  "STORYBOARD",
  "REVIEW_PRE_PRODUCTION",
  // Phase 3: Production
  "PROMPT_GENERATION",
  "IMAGE_GENERATION",
  "REVIEW_IMAGES",
  "MOTION_GENERATION",
  "VIDEO_GENERATION",
  "REVIEW_PRODUCTION",
  // Final
  "RENDERING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  // Legacy statuses (kept for existing data)
  "REVIEW_SCENES",
  "TTS_REVIEW",
  "REVIEW_PROMPTS",
  "REVIEW_MOTION",
  "IMAGE_REVIEW",
  "REVIEW_VIDEO",
  "SCRIPT",
  "REVIEW_SCRIPT",
  "MUSIC_SCRIPT",
  "REVIEW_MUSIC_SCRIPT",
  "MUSIC_GENERATION",
  "MUSIC_REVIEW",
  "VIDEO_SCRIPT",
  "REVIEW_VISUAL",
  "REVIEW_STORY_LEGACY",
]);

export const renderStepEnum = pgEnum("render_step", [
  "SCRIPT",
  "TTS",
  "MEDIA",
  "COMPOSE",
  "DONE",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "QUEUED",
  "ACTIVE",
  "COMPLETED",
  "FAILED",
  "RETRYING",
]);

// ── Auth Tables (NextAuth) ──

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  planTier: planTierEnum("plan_tier").default("FREE").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    uniqueIndex("provider_account_idx").on(table.provider, table.providerAccountId),
  ]
);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionToken: text("session_token").notNull().unique(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [
    uniqueIndex("verification_token_idx").on(table.identifier, table.token),
  ]
);

// ── Domain Tables ──

export const series = pgTable("series", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  niche: text("niche").notNull(),
  style: text("style").default("cinematic").notNull(),
  defaultVoiceId: text("default_voice_id"),
  llmModel: text("llm_model").default("anthropic/claude-opus-4.6"),
  imageModel: text("image_model").default("dall-e-3"),
  videoModel: text("video_model").default("kling-3-standard"),
  language: text("language").default("en").notNull(),
  captionStyle: text("caption_style").default("none").notNull(),
  characterImages: json("character_images").$type<Array<{ url: string; description: string }>>().default([]),
  storyAssets: json("story_assets").$type<Array<{ id: string; type: "character" | "location" | "prop"; name: string; description: string; url: string; sheetUrl?: string }>>().default([]),
  sceneContinuity: integer("scene_continuity").default(1).notNull(),
  videoSize: text("video_size").default("9:16").notNull(),
  videoType: text("video_type").default("standalone").notNull(),
  isInternal: boolean("is_internal").default(false).notNull(),
  topicIdeas: json("topic_ideas").$type<string[]>().default([]).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const videoProjects = pgTable("video_projects", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  seriesId: text("series_id").references(() => series.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  status: videoStatusEnum("status").default("PENDING").notNull(),
  title: text("title"),
  language: text("language").default("en").notNull(),
  videoType: text("video_type").default("standalone").notNull(),
  script: text("script"),
  duration: integer("duration"),
  config: json("config"),
  outputUrl: text("output_url"),
  thumbnailUrl: text("thumbnail_url"),
  llmModel: text("llm_model").default("anthropic/claude-opus-4.6"),
  imageModel: text("image_model").default("dall-e-3"),
  videoModel: text("video_model").default("kling-3-standard"),
  videoSize: text("video_size"),
  idea: text("prompt"),
  style: text("style").default("cinematic").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const videoScenes = pgTable("video_scenes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  videoProjectId: text("video_project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  sceneOrder: integer("scene_order").notNull(),
  sceneTitle: text("scene_title"),
  directorNote: text("director_note"),
  text: text("text").notNull(),
  imagePrompt: text("image_prompt"),
  visualDescription: text("visual_description"),
  searchQuery: text("search_query"),
  captionData: json("caption_data"),
  audioUrl: text("audio_url"),
  imageUrl: text("image_url"),
  videoUrl: text("video_url"),
  // deprecated — kept for backward compat with existing data
  assetUrl: text("asset_url"),
  assetType: text("asset_type"),
  modelUsed: text("model_used"),
  speaker: text("speaker"),
  assetRefs: json("asset_refs").$type<string[]>(),
  duration: real("duration"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const sceneFrames = pgTable("scene_frames", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sceneId: text("scene_id").notNull().references(() => videoScenes.id, { onDelete: "cascade" }),
  frameOrder: integer("frame_order").notNull(),
  clipDuration: real("clip_duration"),
  imagePrompt: text("image_prompt"),
  /** Structured architect output; subject.primary merged with continuity before serialize. */
  imageSpec: json("image_spec").$type<ImageSpec | null>(),
  /** Last prompt-contract assessment (deriveFinalStatus, reason codes, flags). */
  promptContractMeta: json("prompt_contract_meta").$type<ResultMeta | null>(),
  /** Structured motion director output; visualDescription is the compiled video prompt. */
  motionSpec: json("motion_spec").$type<FrameMotionSpec | null>(),
  visualDescription: text("visual_description"),
  imageMediaId: text("image_media_id"),
  videoMediaId: text("video_media_id"),
  modelUsed: text("model_used"),
  assetRefs: json("asset_refs").$type<string[]>(),
  imageGeneratedAt: timestamp("image_generated_at", { mode: "date" }),
  videoGeneratedAt: timestamp("video_generated_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const media = pgTable("media", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sceneId: text("scene_id").references(() => videoScenes.id, { onDelete: "cascade" }),
  frameId: text("frame_id").references(() => sceneFrames.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  url: text("url").notNull(),
  prompt: text("prompt"),
  modelUsed: text("model_used"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const renderJobs = pgTable("render_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  videoProjectId: text("video_project_id").notNull().references(() => videoProjects.id, { onDelete: "cascade" }),
  step: renderStepEnum("step").default("SCRIPT").notNull(),
  status: jobStatusEnum("status").default("QUEUED").notNull(),
  progress: integer("progress").default(0).notNull(),
  attempts: integer("attempts").default(0).notNull(),
  maxAttempts: integer("max_attempts").default(3).notNull(),
  error: text("error"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const assets = pgTable("assets", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  url: text("url").notNull(),
  sourceProvider: text("source_provider").notNull(),
  licenseType: text("license_type"),
  mimeType: text("mime_type"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  status: text("status").default("inactive").notNull(),
  currentPeriodStart: timestamp("current_period_start", { mode: "date" }),
  currentPeriodEnd: timestamp("current_period_end", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const usageEntries = pgTable("usage_entries", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  credits: integer("credits").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

// ── Relations ──

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  series: many(series),
  subscriptions: many(subscriptions),
  usageEntries: many(usageEntries),
}));

export const seriesRelations = relations(series, ({ one, many }) => ({
  user: one(users, { fields: [series.userId], references: [users.id] }),
  videoProjects: many(videoProjects),
}));

export const videoProjectsRelations = relations(videoProjects, ({ one, many }) => ({
  series: one(series, { fields: [videoProjects.seriesId], references: [series.id] }),
  scenes: many(videoScenes),
  renderJobs: many(renderJobs),
}));

export const videoScenesRelations = relations(videoScenes, ({ one, many }) => ({
  videoProject: one(videoProjects, { fields: [videoScenes.videoProjectId], references: [videoProjects.id] }),
  media: many(media, { relationName: "sceneMedia" }),
  frames: many(sceneFrames),
}));

export const mediaRelations = relations(media, ({ one }) => ({
  scene: one(videoScenes, { fields: [media.sceneId], references: [videoScenes.id], relationName: "sceneMedia" }),
  frame: one(sceneFrames, { fields: [media.frameId], references: [sceneFrames.id], relationName: "frameMedia" }),
}));

export const sceneFramesRelations = relations(sceneFrames, ({ one, many }) => ({
  scene: one(videoScenes, { fields: [sceneFrames.sceneId], references: [videoScenes.id] }),
  imageMedia: one(media, { fields: [sceneFrames.imageMediaId], references: [media.id], relationName: "frameImageMedia" }),
  videoMedia: one(media, { fields: [sceneFrames.videoMediaId], references: [media.id], relationName: "frameVideoMedia" }),
  media: many(media, { relationName: "frameMedia" }),
}));

export const renderJobsRelations = relations(renderJobs, ({ one }) => ({
  videoProject: one(videoProjects, { fields: [renderJobs.videoProjectId], references: [videoProjects.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
}));

export const usageEntriesRelations = relations(usageEntries, ({ one }) => ({
  user: one(users, { fields: [usageEntries.userId], references: [users.id] }),
}));
