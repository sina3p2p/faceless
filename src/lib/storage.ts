import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { STORAGE } from "@/lib/constants";

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
