import { NextRequest, NextResponse } from "next/server";
import { getSignedDownloadUrl } from "@/lib/storage";

// Edge runtime: cheap, distributed, low cold-start. The AWS SDK v3 presigner
// runs on WebCrypto and is edge-compatible.
export const runtime = "edge";

// Public proxy. Keys are UUID-scoped and unguessable; this matches the
// exposure of R2_PUBLIC_URL. Required to be public so image/video providers
// can fetch the asset when we hand them mediaUrl(key).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fullKey = key.map(decodeURIComponent).join("/");

  try {
    const { url, expiresAt } = await getSignedDownloadUrl(fullKey);
    const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
    const res = NextResponse.redirect(url, 302);
    // Browser + CDN cache the redirect itself. Within a bucket window the
    // signed URL is identical across requests, so this effectively turns the
    // proxy into a thin signing CDN: one presign per (key, hour-bucket) per
    // edge region; everything else is a cache hit.
    res.headers.set(
      "Cache-Control",
      `public, max-age=${maxAge}, s-maxage=${maxAge}`
    );
    return res;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
