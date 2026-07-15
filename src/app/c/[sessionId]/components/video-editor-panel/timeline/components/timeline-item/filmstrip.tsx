"use client";

import { useEffect, useRef, useState } from "react";
import { filmstripTileCount } from "@/lib/filmstrip";

const FRAME_ASPECT = 16 / 9;

/**
 * Server filmstrip (~1 frame/sec of source).
 *
 * Display rules (editor-style):
 * - Prefer ~1 timeline-second per thumb when zoomed in
 * - Never thinner than 16:9 for the track height (readable when zoomed out)
 * - If the whole clip is narrower than one readable thumb, show a single poster
 *
 * Frame choice always follows source time (trim + reverse).
 */
export function Filmstrip({
  filmstripUrl,
  tileCount,
  durationSeconds,
  trimStart = 0,
  trimEnd = null,
  reversed = false,
  pxPerSec,
}: {
  filmstripUrl: string;
  tileCount?: number;
  durationSeconds?: number;
  trimStart?: number;
  trimEnd?: number | null;
  reversed?: boolean;
  pxPerSec?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const raw = Math.max(0.001, durationSeconds ?? 1);
  const rangeStart = Math.max(0, trimStart);
  const rangeEnd = Math.min(raw, trimEnd ?? raw);
  const range = Math.max(0.001, rangeEnd - rangeStart);

  const tiles =
    tileCount && tileCount > 0 ? tileCount : filmstripTileCount(raw);

  const minThumbW = size.h > 0 ? size.h * FRAME_ASPECT : 0;
  const thumbW =
    minThumbW > 0
      ? Math.max(minThumbW, pxPerSec && pxPerSec > 0 ? pxPerSec : minThumbW)
      : 0;

  function frameAt(u: number) {
    const t = reversed ? rangeEnd - u * range : rangeStart + u * range;
    return Math.min(tiles - 1, Math.max(0, Math.floor((t / raw) * tiles)));
  }

  // Clip too narrow for a readable strip → one poster frame.
  if (thumbW > 0 && size.w > 0 && size.w < minThumbW * 0.85) {
    const fi = frameAt(0.5);
    return (
      <div ref={rootRef} className="absolute inset-0 overflow-hidden bg-black/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={filmstripUrl}
          alt=""
          draggable={false}
          className="absolute top-0 h-full max-w-none"
          style={{
            width: size.h * FRAME_ASPECT * tiles,
            left: -fi * size.h * FRAME_ASPECT,
          }}
        />
      </div>
    );
  }

  const count = thumbW > 0 ? Math.max(1, Math.ceil(size.w / thumbW)) : 0;

  return (
    <div ref={rootRef} className="absolute inset-0 flex overflow-hidden bg-black/40">
      {thumbW > 0 &&
        Array.from({ length: count }, (_, i) => {
          const u = count <= 1 ? 0.5 : (i + 0.5) / count;
          const fi = frameAt(u);
          return (
            <div
              key={i}
              className={`relative h-full shrink-0 overflow-hidden${i < count - 1 ? " border-r border-black/30" : ""}`}
              style={{ width: thumbW }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={filmstripUrl}
                alt=""
                draggable={false}
                className="absolute top-0 h-full max-w-none"
                style={{
                  width: thumbW * tiles,
                  left: -fi * thumbW,
                }}
              />
            </div>
          );
        })}
    </div>
  );
}
