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
// third-party image/video providers. The proxy at /api/media/[...key] signs
// the underlying R2 request on demand and 302-redirects.
//
// Pass-through is provided for values that are already absolute URLs.
export function mediaUrl(keyOrUrl: string): string;
export function mediaUrl(keyOrUrl: string | null | undefined): string | null;
export function mediaUrl(keyOrUrl: string | null | undefined): string | null {
  if (!keyOrUrl) return null;
  if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;
  const base = APP.url.replace(/\/$/, "");
  return `${base}/api/media/${keyOrUrl.replace(/^\/+/, "")}`;
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

export async function getSignedDownloadUrl(
  key: string,
  expiresIn = 3600
): Promise<string> {
  if (R2_PUBLIC_URL) {
    const base = R2_PUBLIC_URL.replace(/\/$/, "");
    return `${base}/${key}`;
  }

  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn });

  if (endpoint && url.includes("s3.amazonaws.com")) {
    const parsed = new URL(url);
    const r2 = new URL(endpoint);
    parsed.hostname = r2.hostname;
    parsed.protocol = r2.protocol;
    parsed.port = r2.port;
    return parsed.toString();
  }

  return url;
}
