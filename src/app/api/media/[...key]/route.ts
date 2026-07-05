import { NextRequest, NextResponse } from "next/server";
import { getSignedDownloadUrl } from "@/lib/storage";

// Edge runtime: cheap, distributed, low cold-start. The AWS SDK v3 presigner
// runs on WebCrypto and is edge-compatible.
export const runtime = "edge";

// Passed through from the upstream R2 response as-is.
const FORWARDED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

// Public proxy. Keys are UUID-scoped and unguessable; this matches the
// exposure of R2_PUBLIC_URL. Streams the object through our own origin
// (rather than redirecting to R2) so the response carries our own CORS
// header — R2 itself doesn't have one configured, which byte-level readers
// like mediabunny's UrlSource (used for timeline filmstrip thumbnails) need
// and a plain <video src> redirect doesn't. The Range header is forwarded so
// video scrubbing/seeking still works via partial content.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string[] }> }
) {
  const { key } = await params;
  const fullKey = key.map(decodeURIComponent).join("/");

  try {
    const { url, expiresAt } = await getSignedDownloadUrl(fullKey);
    const maxAge = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));

    const range = req.headers.get("range");
    const upstream = await fetch(url, range ? { headers: { Range: range } } : undefined);
    if (!upstream.ok) {
      return new NextResponse("Not found", { status: 404 });
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    // Signed URL is identical for every request within the same hour bucket,
    // so this is still cache-friendly at the browser/CDN layer despite no
    // longer being a bare redirect.
    headers.set("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}`);
    // Public + unguessable key (see comment above) — safe to allow any origin
    // to fetch() it, which browser-side callers like Remotion's prefetch() need.
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
