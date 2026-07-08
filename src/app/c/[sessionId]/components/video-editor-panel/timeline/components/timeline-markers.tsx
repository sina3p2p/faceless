"use client";

import { useLayoutEffect, useRef } from "react";
import { useTimelineStore } from "../stores/use-timeline-store";
import { usePointerDrag, formatTime } from "../../use-pointer-drag";
import { RULER_H, LABEL_W } from "../constants";

export function TimelineMarkers({ pxPerSec, totalDuration }: { pxPerSec: number; totalDuration: number }) {
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const fps = useTimelineStore((s) => s.fps);
  const hoverTime = useTimelineStore((s) => s.hoverTime);
  const onFrameChange = useTimelineStore((s) => s.onFrameChange);

  const displayTime = currentFrame / fps;
  const pxPerSecRef = useRef(pxPerSec);
  useLayoutEffect(() => {
    pxPerSecRef.current = pxPerSec;
  });

  const startPlayheadDrag = usePointerDrag<{ startX: number; startTime: number }>((state, { clientX }) => {
    const t = Math.max(0, Math.min(state.startTime + (clientX - state.startX) / pxPerSecRef.current, totalDuration));
    onFrameChange(Math.round(t * fps));
  });

  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const totalTicks = totalDuration > 0 ? Math.ceil(totalDuration / tickInterval) + 2 : 20;

  return (
    <>
      {hoverTime !== null && (
        <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left: LABEL_W + hoverTime * pxPerSec }}>
          <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
            <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-8 border-l-transparent border-r-transparent border-t-sky-400" />
            <span className="text-[9px] font-mono text-sky-300 bg-black/50 px-1 rounded mt-0.5 whitespace-nowrap">
              {formatTime(hoverTime)}
            </span>
          </div>
          <div className="absolute top-[8px] bottom-0 w-px bg-sky-400/60 -translate-x-px" />
        </div>
      )}

      <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: LABEL_W + displayTime * pxPerSec }}>
        <div
          onPointerDown={(e) => startPlayheadDrag({ startX: e.clientX, startTime: displayTime }, e)}
          className="absolute top-0 left-1/2 -translate-x-1/2 cursor-ew-resize select-none pointer-events-auto"
          style={{ touchAction: "none" }}
        >
          <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-8 border-l-transparent border-r-transparent border-t-red-400" />
          <div className="absolute -inset-2" />
        </div>
        <div className="absolute top-[8px] bottom-0 w-[1.5px] bg-red-400/90 -translate-x-px" />
      </div>

      <div className="absolute top-0 left-0 right-0 bg-black/40 border-b border-white/8 z-10" style={{ height: RULER_H }}>
        <div
          className="absolute top-0 bottom-0 bg-black/40 border-r border-white/8 flex items-center justify-center z-20"
          style={{ width: LABEL_W, position: "sticky", left: 0 }}
        >
          <span className="text-[9px] text-muted-foreground/30 font-mono select-none">TIME</span>
        </div>
        <div className="absolute top-0 bottom-0" style={{ left: LABEL_W }}>
          {Array.from({ length: totalTicks }, (_, i) => {
            const t = i * tickInterval;
            const x = t * pxPerSec;
            const isMajor = t % (tickInterval * 2) === 0;
            return (
              <div key={t} className="absolute bottom-0 flex flex-col-reverse items-start" style={{ left: x }}>
                <div className={`w-px ${isMajor ? "bg-white/20" : "bg-white/8"}`} style={{ height: isMajor ? 10 : 5 }} />
                {isMajor && <span className="text-[9px] text-muted-foreground/40 ml-1 select-none mb-1 font-mono">{formatTime(t)}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
