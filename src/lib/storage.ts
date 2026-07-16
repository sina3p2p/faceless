import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, timingSafeEqual } from "node:crypto";
import { APP, STORAGE } from "@/lib/constants";

const endpoint = STORAGE.endpoint;

const s3 = new S3Client({
  endpoint,
  region: STORAGE.region,
  credentials: {
    accessKeyId: STORAGE.accessKeyId,
    secretAccessKey: STORAGE.secretAccessKey,
  },
  forcePathStyle: true,
});

const BUCKET = STORAGE.bucket;

/** TTL for `/api/media/[...key]?exp=&sig=` links sent to AI providers. */
export const MEDIA_PROXY_TTL_SEC = 7 * 24 * 60 * 60; // 604_800

function mediaProxySecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.MEDIA_PROXY_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXTAUTH_SECRET (or MEDIA_PROXY_SECRET) is required for media proxy URLs");
    }
    return "dev-insecure-media-proxy-secret";
  }
  return secret;
}

function signMediaProxy(key: string, exp: number): string {
  return createHmac("sha256", mediaProxySecret())
    .update(`${key}:${exp}`)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Extract an object-storage key from a bare key, a legacy `/api/media/...`
 * URL, or one of our own signed R2 URLs. Returns null for external URLs we
 * cannot re-sign (OpenAI CDNs, etc.).
 */
export function storageKeyFrom(keyOrUrl: string): string | null {
  const trimmed = keyOrUrl.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    const cleaned = trimmed.replace(/^\/+/, "");
    if (cleaned.startsWith("api/media/")) return cleaned.slice("api/media/".length);
    return cleaned;
  }

  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    return null;
  }

  const marker = "/api/media/";
  const idx = u.pathname.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(u.pathname.slice(idx + marker.length));
  }

  // Path-style signed URL: https://<endpoint>/<bucket>/<key>?X-Amz-...
  if (endpoint) {
    try {
      if (u.hostname === new URL(endpoint).hostname) {
        const parts = u.pathname.replace(/^\/+/, "").split("/");
        if (parts[0] === BUCKET && parts.length > 1) {
          return decodeURIComponent(parts.slice(1).join("/"));
        }
      }
    } catch {
      // ignore malformed endpoint
    }
  }

  return null;
}

/**
 * Resolve a storage key (or legacy media URL) to a short-lived signed R2 URL
 * for the client or a third-party provider. Passes through external absolute
 * URLs unchanged. Bucket stays private — no public CDN shortcut.
 */
export async function mediaUrl(keyOrUrl: string): Promise<string>;
export async function mediaUrl(keyOrUrl: string | null | undefined): Promise<string | null>;
export async function mediaUrl(keyOrUrl: string | null | undefined): Promise<string | null> {
  if (!keyOrUrl) return null;
  const key = storageKeyFrom(keyOrUrl);
  if (!key) return keyOrUrl;
  const { url } = await getSignedDownloadUrl(key);
  return url;
}

export async function mediaUrls(
  keys: Array<string | null | undefined>
): Promise<string[]> {
  const signed = await Promise.all(keys.map((k) => mediaUrl(k)));
  return signed.filter((u): u is string => !!u);
}

/**
 * Public app proxy URL for AI providers (OpenRouter downloads these).
 * Shape: `{APP.url}/api/media/{key}?exp=&sig=` — HMAC so the bucket stays private.
 * Passes through external absolute URLs we cannot proxy.
 */
export function agentMediaUrl(keyOrUrl: string): string;
export function agentMediaUrl(keyOrUrl: string | null | undefined): string | null;
export function agentMediaUrl(keyOrUrl: string | null | undefined): string | null {
  if (!keyOrUrl) return null;
  const key = storageKeyFrom(keyOrUrl);
  if (!key) return keyOrUrl;
  return buildMediaProxyUrl(key);
}

export function agentMediaUrls(
  keys: Array<string | null | undefined>
): string[] {
  return keys
    .map((k) => agentMediaUrl(k))
    .filter((u): u is string => !!u);
}

/** Build a bucketed HMAC proxy URL (stable within the TTL window). */
export function buildMediaProxyUrl(
  key: string,
  ttlSec = MEDIA_PROXY_TTL_SEC
): string {
  const ttl = Math.min(Math.max(60, ttlSec), MEDIA_PROXY_TTL_SEC);
  const nowSec = Math.floor(Date.now() / 1000);
  const bucketStart = Math.floor(nowSec / ttl) * ttl;
  const exp = bucketStart + ttl;
  const sig = signMediaProxy(key, exp);
  const path = key
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${APP.url.replace(/\/$/, "")}/api/media/${path}?exp=${exp}&sig=${sig}`;
}

export function verifyMediaProxyRequest(
  key: string,
  expRaw: string | null,
  sig: string | null
): boolean {
  if (!key || !expRaw || !sig) return false;
  if (key.includes("..") || key.startsWith("/") || key.includes("\0")) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, signMediaProxy(key, exp));
}

/** Fetch object bytes from private storage (used by `/api/media/[...key]`). */
export async function getStoredObject(
  key: string
): Promise<{ body: Buffer; contentType: string } | null> {
  try {
    const out = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key })
    );
    if (!out.Body) return null;
    const body = Buffer.from(await out.Body.transformToByteArray());
    const contentType =
      out.ContentType ||
      contentTypeFromKey(key) ||
      "application/octet-stream";
    return { body, contentType };
  } catch {
    return null;
  }
}

function contentTypeFromKey(key: string): string | null {
  const ext = key.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
    default:
      return null;
  }
}

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

// R2/S3 SigV4 hard limit — cannot do "never" or 99 years.
// https://developers.cloudflare.com/r2/api/s3/presigned-urls/
export const SIGNED_URL_MAX_TTL_SEC = 7 * 24 * 60 * 60; // 604_800

// Resolve a private R2 download URL plus the unix timestamp at which it expires.
// Bucketed signing: signingDate is rounded down to the nearest bucket boundary
// so all callers within the same window get the *same* URL (cache-friendly).
export async function getSignedDownloadUrl(
  key: string,
  bucketSizeSec = SIGNED_URL_MAX_TTL_SEC
): Promise<{ url: string; expiresAt: number }> {
  const ttl = Math.min(Math.max(1, bucketSizeSec), SIGNED_URL_MAX_TTL_SEC);
  const nowSec = Math.floor(Date.now() / 1000);
  const bucketStart = Math.floor(nowSec / ttl) * ttl;
  const expiresAt = bucketStart + ttl;

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, {
    expiresIn: ttl,
    signingDate: new Date(bucketStart * 1000),
  });

  if (endpoint && url.includes("s3.amazonaws.com")) {
    const parsed = new URL(url);
    const r2 = new URL(endpoint);
    parsed.hostname = r2.hostname;
    parsed.protocol = r2.protocol;
    parsed.port = r2.port;
    return { url: parsed.toString(), expiresAt };
  }

  return { url, expiresAt };
}
