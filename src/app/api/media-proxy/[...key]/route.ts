import { NextRequest, NextResponse } from "next/server";
import { getSignedDownloadUrl } from "@/lib/storage";

export const runtime = "edge";

// Passed through from the upstream R2 response as-is.
const FORWARDED_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
];

// Same-origin stream of R2 objects. Used when the browser must `fetch()` the
// bytes (filmstrip thumbnails, Remotion `prefetch()`) — R2 itself has no CORS.
// Also used as the Player `<video>` src so Range seeks stay same-origin and
// share cache with prefetch.
//
// Streams the upstream body (including Range responses). Do NOT arrayBuffer()
// the whole object here — that stalls under concurrent clip load.
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
    if (!upstream.ok && upstream.status !== 206) {
      return new NextResponse("Not found", { status: 404 });
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}`);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", FORWARDED_HEADERS.join(", "));

    return new NextResponse(upstream.body, { status: upstream.status, headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
