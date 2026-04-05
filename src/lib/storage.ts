import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = process.env.S3_ENDPOINT || undefined;

const s3 = new S3Client({
  endpoint,
  region: process.env.S3_REGION || "auto",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET || "faceless-media";
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

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
