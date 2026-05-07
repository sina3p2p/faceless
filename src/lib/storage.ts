import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { STORAGE, APP } from "@/lib/constants";

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
const R2_PUBLIC_URL = STORAGE.r2PublicUrl;

// Stable, public, sync URL for assets stored in object storage. Returns an
// absolute URL so the same value works for <img> tags AND for sending to
// third-party image/video providers.
//
// When R2_PUBLIC_URL is set, keys resolve straight to that origin (scales with
// R2/CDN; no Next hop). Otherwise the proxy at /api/media/[...key] signs (or
// redirects) on demand.
//
// Pass-through is provided for values that are already absolute URLs.
export function mediaUrl(keyOrUrl: string): string;
export function mediaUrl(keyOrUrl: string | null | undefined): string | null;
export function mediaUrl(keyOrUrl: string | null | undefined): string | null {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  const key = keyOrUrl.replace(/^\/+/, "");
  if (R2_PUBLIC_URL) {
    const base = R2_PUBLIC_URL.replace(/\/$/, "");
    return `${base}/${key}`;
  }
  const base = APP.url.replace(/\/$/, "");
  return `${base}/api/media/${key}`;
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

// Resolve an R2 download URL plus the unix timestamp at which it expires.
// Bucketed signing: signingDate is rounded down to the nearest bucket
// boundary so all callers within the same window get the *same* URL — which
// makes the proxy's redirect cache-friendly at the browser/CDN layer.
export async function getSignedDownloadUrl(
  key: string,
  bucketSizeSec = 3600
): Promise<{ url: string; expiresAt: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucketStart = Math.floor(nowSec / bucketSizeSec) * bucketSizeSec;
  const expiresAt = bucketStart + bucketSizeSec;

  if (R2_PUBLIC_URL) {
    const base = R2_PUBLIC_URL.replace(/\/$/, "");
    // Public URL never expires — use the next bucket boundary anyway so
    // callers can set a sensible Cache-Control max-age.
    return { url: `${base}/${key}`, expiresAt };
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, {
    expiresIn: bucketSizeSec,
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
