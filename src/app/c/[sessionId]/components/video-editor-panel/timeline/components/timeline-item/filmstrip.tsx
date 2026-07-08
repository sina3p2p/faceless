"use client";

import { useEffect, useState } from "react";
import { ALL_FORMATS, CanvasSink, Input, UrlSource } from "mediabunny";

const FILMSTRIP_TILES = 6;
const THUMB_WIDTH = 160;

// mediabunny's UrlSource does a real byte-level fetch() to decode frames —
// /api/media/[key] is a redirect to R2 (which has no CORS headers of its
// own), so that fetch needs the buffering, same-origin-CORS proxy instead.
function toProxyUrl(videoUrl: string): string {
  return videoUrl.replace("/api/media/", "/api/media-proxy/");
}

// One demuxer+decoder pipeline per source video, reused across every clip
// instance and every trim change — canvasesAtTimestamps() decodes each
// packet at most once even for repeated/sparse timestamp requests.
const sinkCache = new Map<string, Promise<CanvasSink | null>>();

function getSink(url: string): Promise<CanvasSink | null> {
  let cached = sinkCache.get(url);
  if (!cached) {
    cached = (async () => {
      const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
      const track = await input.getPrimaryVideoTrack();
      return track ? new CanvasSink(track, { width: THUMB_WIDTH }) : null;
    })();
    sinkCache.set(url, cached);
  }
  return cached;
}

function canvasToBlobUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob().then((blob) => URL.createObjectURL(blob));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("toBlob failed"))));
  });
}

// Rounded to 0.1s so repeated calls during a trim drag hit cache instead of
// re-decoding — a filmstrip preview doesn't need frame-exact timestamps.
const thumbCache = new Map<string, string>();

async function getFilmstripThumbnails(url: string, timestamps: number[]): Promise<(string | null)[]> {
  const results: (string | null)[] = new Array(timestamps.length).fill(null);
  const missing: { index: number; timestamp: number }[] = [];
  timestamps.forEach((t, i) => {
    const key = `${url}::${t.toFixed(1)}`;
    const cached = thumbCache.get(key);
    if (cached) results[i] = cached;
    else missing.push({ index: i, timestamp: t });
  });
  if (missing.length === 0) return results;

  const sink = await getSink(url);
  if (!sink) return results;

  const sorted = [...missing].sort((a, b) => a.timestamp - b.timestamp);
  let i = 0;
  for await (const wrapped of sink.canvasesAtTimestamps(sorted.map((m) => m.timestamp))) {
    const { index, timestamp } = sorted[i]!;
    i++;
    if (!wrapped) continue;
    const blobUrl = await canvasToBlobUrl(wrapped.canvas);
    thumbCache.set(`${url}::${timestamp.toFixed(1)}`, blobUrl);
    results[index] = blobUrl;
  }
  return results;
}

export function Filmstrip({
  videoUrl,
  trimStart,
  trimEnd,
  raw,
}: {
  videoUrl: string;
  trimStart: number;
  trimEnd: number | null;
  raw: number;
}) {
  const end = trimEnd ?? raw;
  const timestamps = Array.from({ length: FILMSTRIP_TILES }, (_, fi) => {
    const pos = FILMSTRIP_TILES > 1 ? fi / (FILMSTRIP_TILES - 1) : 0;
    return trimStart + pos * (end - trimStart);
  });
  const tsKey = timestamps.map((t) => t.toFixed(1)).join(",");

  const [thumbs, setThumbs] = useState<(string | null)[]>(() => timestamps.map(() => null));

  useEffect(() => {
    let cancelled = false;
    getFilmstripThumbnails(toProxyUrl(videoUrl), timestamps).then((urls) => {
      if (!cancelled) setThumbs(urls);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tsKey is the real identity of the timestamps array
  }, [videoUrl, tsKey]);

  return (
    <div className="absolute inset-0 flex overflow-hidden">
      {timestamps.map((_, fi) => (
        <div key={fi} className={`relative flex-1 h-full overflow-hidden bg-black/40${fi < FILMSTRIP_TILES - 1 ? " border-r border-black/40" : ""}`}>
          {thumbs[fi] && (
            // eslint-disable-next-line @next/next/no-img-element -- blob: URL, not eligible for next/image
            <img src={thumbs[fi]!} className="absolute inset-0 w-full h-full object-cover opacity-80" alt="" />
          )}
        </div>
      ))}
    </div>
  );
}
