"use client";

import { useEffect, useRef, useState } from "react";
import type { ShotResult } from "@/types/v2/story";

function LazyShotVideo({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      src={active ? src : undefined}
      controls
      preload={active ? "metadata" : "none"}
      className="w-full"
      style={{ aspectRatio: "16/9", background: "rgba(255,255,255,0.03)" }}
    />
  );
}

export function ShotPreviewPanel({
  shotResult,
  disabled,
  onApprove,
  onRetry,
}: {
  shotResult: ShotResult;
  disabled?: boolean;
  onApprove?: () => void;
  onRetry?: () => void;
}) {
  if (shotResult.loading) {
    return (
      <div className="mt-1 rounded-xl overflow-hidden border border-white/10 bg-white/5 animate-pulse flex flex-col justify-end" style={{ aspectRatio: "16/9" }}>
        <div className="p-3 space-y-2 bg-linear-to-t from-black/40">
          <div className="h-0.5 rounded-full bg-white/10" />
          <div className="flex items-center gap-2">
            <div className="w-5 h-3 rounded bg-white/10" />
            <div className="w-10 h-2 rounded bg-white/10" />
            <div className="flex-1" />
            <div className="w-6 h-3 rounded bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (shotResult.videoUrl) {
    return (
      <div className="mt-1 space-y-2">
        <div className="rounded-xl overflow-hidden border border-white/10">
          <LazyShotVideo src={shotResult.videoUrl} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {shotResult.approved ? (
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
              ✓ In timeline
            </span>
          ) : (
            <button
              onClick={onApprove}
              disabled={disabled || !onApprove}
              className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
              </svg>
              Approve shot
            </button>
          )}
          {!shotResult.approved && onRetry && (
            <button
              onClick={onRetry}
              disabled={disabled}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Regenerate
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-1 flex items-center gap-3">
      <p className="text-xs text-red-400">{shotResult.error ?? "Shot render failed."}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={disabled}
          className="text-xs text-primary hover:text-primary border border-primary/30 hover:border-primary/50 rounded-lg px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Retry
        </button>
      )}
    </div>
  );
}
