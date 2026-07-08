"use client";

import { useTimelineStore } from "../stores/use-timeline-store";
import { LABEL_W } from "../constants";

export function TimelineGuidelines({ pxPerSec }: { pxPerSec: number }) {
  const snapGuide = useTimelineStore((s) => s.snapGuide);
  if (snapGuide === null) return null;

  return (
    <div
      className="absolute top-0 bottom-0 z-40 w-px bg-emerald-400/70 pointer-events-none"
      style={{ left: LABEL_W + snapGuide * pxPerSec }}
    />
  );
}
