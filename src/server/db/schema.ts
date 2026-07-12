import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
  json,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──

export const planTierEnum = pgEnum("plan_tier", ["FREE", "STARTER", "PRO"]);

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

/** Web research pack for a video (1:1). Claims live in `research_claims`. */
export const researchPacks = pgTable("research_packs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  generatedAt: timestamp("generated_at", { mode: "date" }).notNull(),
  queries: json("queries").$type<string[]>().notNull(),
  searchProvider: text("search_provider").notNull().default("tavily"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const researchClaims = pgTable(
  "research_claims",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    researchPackId: text("research_pack_id")
      .notNull()
      .references(() => researchPacks.id, { onDelete: "cascade" }),
    claimOrder: integer("claim_order").notNull(),
    claimText: text("claim_text").notNull(),
    sourceUrl: text("source_url").notNull(),
    evidenceSnippet: text("evidence_snippet").notNull(),
    retrievedAt: timestamp("retrieved_at", { mode: "date" }).notNull(),
    asOfDate: timestamp("as_of_date", { mode: "date" }),
    confidence: text("confidence").notNull(),
    sourceTitle: text("source_title").notNull(),
    sourceDomain: text("source_domain").notNull(),
    sourcePublishedAt: timestamp("source_published_at", { mode: "date" }),
    sourceType: text("source_type"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("research_claims_research_pack_id_idx").on(t.researchPackId),
  ]
);

export const media = pgTable("media", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  url: text("url").notNull(),
  prompt: text("prompt"),
  modelUsed: text("model_used").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
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

/**
 * Full request/response audit log for every call to an external AI model
 * (LLM, image, video, audio). Captures who/what/when so a generation can be
 * traced back to the exact prompt, model, and provider response that produced
 * it. Large binary outputs (base64 image bytes) are redacted with a marker —
 * the persisted media URL is recorded in `responseSummary` instead.
 */
export const aiAuditLogs = pgTable(
  "ai_audit_logs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    /** Wall-clock time the call was started. */
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    /** "openai" | "openrouter" | "fal" | "suno" — the upstream service. */
    provider: text("provider").notNull(),
    /** Model identifier exactly as sent to the provider (e.g. "gpt-image-1.5", "anthropic/claude-opus-4.6"). */
    model: text("model").notNull(),
    /** "success" | "error". */
    status: text("status").notNull(),
    /** Wall-clock duration of the call. */
    durationMs: integer("duration_ms"),
    /** Error message when status="error". */
    errorMessage: text("error_message"),
    /** Full request payload (system prompt, messages, temperature, etc.). */
    request: json("request").notNull(),
    /** Full response payload (text, structured object, image URL, etc.). Base64 blobs are redacted. */
    response: json("response"),
  },
  (t) => [
    index("ai_audit_logs_provider_model_idx").on(t.provider, t.model),
  ],
);

// ── Relations ──

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  subscriptions: many(subscriptions),
  usageEntries: many(usageEntries),
  filmSessions: many(filmSessions),
}));


export const researchPacksRelations = relations(researchPacks, ({ one, many }) => ({
  claims: many(researchClaims),
}));

export const researchClaimsRelations = relations(researchClaims, ({ one }) => ({
  researchPack: one(researchPacks, { fields: [researchClaims.researchPackId], references: [researchPacks.id] }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
}));

export const usageEntriesRelations = relations(usageEntries, ({ one }) => ({
  user: one(users, { fields: [usageEntries.userId], references: [users.id] }),
}));

// ── Story Room (v2) ──────────────────────────────────────────────────────────

export const filmSessionStatusEnum = pgEnum("film_session_status", [
  "in_progress",
  "completed",
  "abandoned",
]);

export const filmSessionPhaseEnum = pgEnum("film_session_phase", [
  "generating",
  "waiting_for_choice",
  "complete",
]);

export const filmSessions = pgTable("film_sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: filmSessionStatusEnum("status").notNull().default("in_progress"),
  title: text("title"),
  seed: integer("seed").default(0).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Each row is one part of a UIMessage.
// message_id groups parts belonging to the same assistant/user turn.
// type identifies the part kind ("text", "tool-askQuestions", …).
// parts stores the full part payload as JSON.
export const filmSessionMessages = pgTable("film_session_messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  messageId: text("message_id").notNull(),
  sessionId: text("session_id").notNull().references(() => filmSessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  type: text("type").notNull(),
  parts: json("parts").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  index("film_session_messages_session_id_created_at_idx").on(t.sessionId, t.createdAt),
]);

// Tracks background BullMQ shot-generation jobs so results survive browser disconnects.
// The chat route inserts a row (status=pending) before enqueueing the BullMQ job.
// The worker updates status/videoUrl here and patches filmSessionMessages when done,
// then publishes a Redis event so the client SSE connection can notify the user instantly.
export const filmShotJobs = pgTable("film_shot_jobs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text("session_id").notNull().references(() => filmSessions.id, { onDelete: "cascade" }),
  toolCallId: text("tool_call_id").notNull(),
  assistantMessageRowId: text("assistant_message_row_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | in_progress | succeeded | failed
  videoUrl: text("video_url"),
  mediaId: text("media_id").references(() => media.id),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const filmSessionsRelations = relations(filmSessions, ({ one, many }) => ({
  user: one(users, { fields: [filmSessions.userId], references: [users.id] }),
  messages: many(filmSessionMessages),
  shotJobs: many(filmShotJobs),
}));

export const filmSessionMessagesRelations = relations(filmSessionMessages, ({ one }) => ({
  session: one(filmSessions, { fields: [filmSessionMessages.sessionId], references: [filmSessions.id] }),
}));
