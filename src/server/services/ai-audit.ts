import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/server/db";
import { aiAuditLogs } from "@/server/db/schema";
import { logger } from "@/lib/logger";
import { generateText as _generateText } from "ai";

export interface AiAuditContext {
  userId?: string;
  videoProjectId?: string;
  sceneId?: string;
  frameId?: string;
  renderJobId?: string;
  bullmqJobId?: string;
}

const storage = new AsyncLocalStorage<AiAuditContext>();

/**
 * Run `fn` with the given audit context attached. Nested calls merge into the
 * existing context — pass only the keys that change.
 */
export function withAiAuditContext<T>(ctx: AiAuditContext, fn: () => Promise<T>): Promise<T> {
  const merged = { ...(storage.getStore() ?? {}), ...ctx };
  return storage.run(merged, fn);
}

export function getAiAuditContext(): AiAuditContext {
  return storage.getStore() ?? {};
}

export type AiProvider = "openai" | "openrouter" | "fal" | "suno";

export interface RecordAiCallMeta {
  provider: AiProvider;
  model: string;
  operation: string;
  request: unknown;
  /** Override or supplement the AsyncLocalStorage context for this call. */
  context?: AiAuditContext;
  /** Optional summarizer for the response (URL, dimensions, taskId, etc.). */
  summarize?: (response: unknown) => unknown;
  /** Optional token-usage extractor. */
  extractUsage?: (response: unknown) => unknown;
}

async function _auditedGenerateText(params: Parameters<typeof _generateText>[0]) {
  const startedAt = new Date();
  const startMs = Date.now();
  const sanitizedRequest = sanitize(params);

  let response;
  let errorMessage: string | undefined;
  try {
    response = await _generateText(params);
    return response;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const durationMs = Date.now() - startMs;
    const status = errorMessage ? "error" : "success";
    const { provider, model } = typeof params.model === 'object' ? { model: params.model.modelId, provider: params.model.provider } : { model: params.model, provider: params.model }
    await db.insert(aiAuditLogs).values({
      createdAt: startedAt,
      provider,
      model,
      status,
      durationMs,
      errorMessage,
      request: sanitizedRequest as object,
      response: errorMessage ? null : (sanitize(response) as object),
    });
  }
}

// Cast to typeof _generateText so callers get exact generic inference (TOOLS, OUTPUT)
// without needing to use Output as a type constraint in this file.
export const generateText = _auditedGenerateText as unknown as typeof _generateText;

/**
 * Wrap an AI call with full request/response audit logging. Persists one row
 * to `ai_audit_logs` after the call resolves (success or error). The audit
 * write is best-effort: failures are logged but never propagated to the
 * caller, so audit problems can't break a generation pipeline.
 */
export async function recordAiCall<T>(
  meta: RecordAiCallMeta,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = { ...getAiAuditContext(), ...(meta.context ?? {}) };
  const startedAt = new Date();
  const startMs = Date.now();
  const sanitizedRequest = sanitize(meta.request);

  let response: T | undefined;
  let errorMessage: string | undefined;
  try {
    response = await fn();
    return response;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const durationMs = Date.now() - startMs;
    const status = errorMessage ? "error" : "success";
    try {
      await db.insert(aiAuditLogs).values({
        createdAt: startedAt,
        provider: meta.provider,
        model: meta.model,
        status,
        durationMs,
        errorMessage,
        request: sanitizedRequest as object,
        response: errorMessage ? null : (sanitize(response) as object),
      });
    } catch (writeErr) {
      logger.warn("ai-audit-log write failed", {
        provider: meta.provider,
        model: meta.model,
        operation: meta.operation,
        videoProjectId: ctx.videoProjectId,
        error: writeErr instanceof Error ? writeErr.message : String(writeErr),
      });
    }
  }
}

/**
 * Walk the value and replace any large base64 blobs (image/audio bytes) with a
 * compact placeholder. Without this, a single image-generation log row can be
 * many megabytes — base64 is the actual binary asset, and the URL we persisted
 * to object storage is the canonical reference.
 */
function sanitize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 8) return "[max-depth]";

  if (typeof value === "string") {
    // Strip data URLs
    if (value.startsWith("data:") && value.length > 256) {
      const header = value.slice(0, value.indexOf(",") + 1);
      const bodyLen = value.length - header.length;
      return `${header}[base64 omitted, bytes=${bodyLen}]`;
    }
    // Strip raw long base64 (heuristic: very long token of base64 chars)
    if (value.length > 4096 && /^[A-Za-z0-9+/=]+$/.test(value.slice(0, 200))) {
      return `[base64 omitted, length=${value.length}]`;
    }
    return value;
  }

  if (typeof value !== "object") return value;

  if (Buffer.isBuffer(value)) {
    return `[Buffer omitted, bytes=${value.length}]`;
  }
  if (value instanceof ArrayBuffer) {
    return `[ArrayBuffer omitted, bytes=${value.byteLength}]`;
  }
  if (ArrayBuffer.isView(value)) {
    return `[TypedArray omitted, bytes=${value.byteLength}]`;
  }
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, depth + 1));
  }

  // Plain object
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    // Common SDK-internal keys for binary blobs
    if (k === "b64_json" && typeof v === "string") {
      out[k] = `[base64 omitted, length=${v.length}]`;
      continue;
    }
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}
