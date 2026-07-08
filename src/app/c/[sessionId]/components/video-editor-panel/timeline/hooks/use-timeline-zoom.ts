import { useEffect, useRef } from "react";
import { useZoomStore } from "../stores/use-zoom-store";
import { MAX_PX_PER_SEC, MIN_PX_PER_SEC } from "../constants";

// Cursor-anchored wheel zoom: Ctrl/Cmd+wheel zooms in/out while keeping the
// timestamp under the cursor stationary; plain wheel scrolls horizontally.
export function useTimelineZoom(scrollRef: React.RefObject<HTMLDivElement | null>) {
  const pxPerSec = useZoomStore((s) => s.pxPerSec);
  const setPxPerSec = useZoomStore((s) => s.setPxPerSec);
  const pendingScrollRef = useRef<number | null>(null);

  useEffect(() => {
    if (pendingScrollRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  }, [pxPerSec, scrollRef]);

  function handleWheel(e: React.WheelEvent) {
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const oldScroll = el.scrollLeft;
      const factor = Math.pow(0.998, e.deltaY);
      const newPx = Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, pxPerSec * factor));
      const timeAtCursor = (cursorX + oldScroll - 48) / pxPerSec;
      pendingScrollRef.current = Math.max(0, timeAtCursor * newPx - cursorX + 48);
      setPxPerSec(Math.round(newPx));
    } else {
      el.scrollLeft += e.deltaY * 1.5;
    }
  }

  return { pxPerSec, handleWheel };
}
