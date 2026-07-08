import { NextRequest, NextResponse } from "next/server";
import { getSignedDownloadUrl } from "@/lib/storage";

export const runtime = "edge";

// Passed through from the upstream R2 response as-is.
const FORWARDED_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"];

// Narrow, buffering counterpart to /api/media/[...key] — used only by
// mediabunny's UrlSource (timeline/components/timeline-item/filmstrip.tsx),
// which does a real byte-level fetch() to decode frames for filmstrip
// thumbnails. R2 doesn't set CORS headers, so that fetch needs the response
// to actually come from our own origin rather than a redirect to R2.
//
// Deliberately not used for general video loading (playback/preload/
// metadata) — those go through the plain redirect at /api/media/[...key].
// @remotion/preload's preloadVideo() calls resolveRedirect(), which does its
// own fetch() to follow a redirect chain; pointing that (and playback, and
// getVideoMetadata) at a route that fully downloads+buffers the file on our
// own server, for every clip concurrently, is what caused most clips to
// never resolve a duration under real load — not a header/encoding issue
// (buffering here doesn't actually avoid Transfer-Encoding: chunked either,
// confirmed via curl; that's just how this dev server responds to dynamic
// routes and is apparently fine for fetch()-based readers regardless).
// Thumbnail decoding only reads a handful of small timestamp ranges per
// clip, so the buffering + proxy overhead is contained to this one feature.
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

    const body = await upstream.arrayBuffer();

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("Content-Length", String(body.byteLength));
    headers.set("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}`);
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(body, { status: upstream.status, headers });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
