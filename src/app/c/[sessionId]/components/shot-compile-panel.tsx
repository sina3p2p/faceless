"use client";

import { useEffect, useRef, useState } from "react";
import { PhotoProvider, PhotoView } from "react-photo-view";
import type { ShotCompile } from "@/types/v2/story";

const MODE_LABEL: Record<NonNullable<ShotCompile["continuityMode"]>, string> = {
  fresh: "Fresh (stills)",
  extend_video: "Extend prior clip",
};

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

export function ShotCompilePanel({
  compile,
  disabled,
  onApproveRender,
  onApproveShot,
  onRetry,
}: {
  compile: ShotCompile;
  disabled?: boolean;
  onApproveRender: (renderPrompt: string) => void;
  onApproveShot?: () => void;
  onRetry?: () => void;
}) {
  const [editedPrompt, setEditedPrompt] = useState(compile.renderPrompt ?? "");
  const refs = compile.referenceImageUrls ?? [];
  const mode = compile.continuityMode ?? "fresh";
  const hasVideo = !!compile.videoUrl;
  const locked = disabled || !!compile.rendering || hasVideo || !!compile.approved;

  if (compile.loading) {
    return <p className="text-xs text-muted-foreground/40 italic animate-pulse">Compiling shot prompt…</p>;
  }

  return (
    <div className="mt-1 rounded-xl border border-white/10 overflow-hidden">
      {compile.rendering ? (
        <div
          className="bg-white/5 animate-pulse flex flex-col justify-end"
          style={{ aspectRatio: "16/9" }}
        >
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
      ) : hasVideo ? (
        <LazyShotVideo src={compile.videoUrl!} />
      ) : (
        <div
          className="bg-background/40 backdrop-blur-sm flex items-center justify-center"
          style={{ aspectRatio: "16/9" }}
        >
          <svg className="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      )}

      <div className="p-3 space-y-3 bg-background/30 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground/55">
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 uppercase tracking-wider">
            {MODE_LABEL[mode]}
          </span>
          {(compile.duration != null || compile.aspectRatio) && (
            <span>
              {[compile.duration != null ? `${compile.duration}s` : null, compile.aspectRatio]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          {compile.rendering && (
            <span className="text-muted-foreground/40 italic animate-pulse">Rendering…</span>
          )}
        </div>

        {refs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              References sent to video model
            </p>
            <PhotoProvider>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {refs.map((url, i) => (
                  <PhotoView key={`${url}-${i}`} src={url}>
                    <div className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-white/5 cursor-zoom-in">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Image${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      <span className="pointer-events-none absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-center text-white/80 py-0.5">
                        Image{i + 1}
                      </span>
                    </div>
                  </PhotoView>
                ))}
              </div>
            </PhotoProvider>
          </div>
        )}

        {compile.sourceVideoUrl && (
          <p className="text-[10px] text-muted-foreground/45 truncate">
            Source clip: {compile.sourceVideoUrl}
          </p>
        )}

        <div className="space-y-2">
          <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
            Prompt — edit before rendering
          </p>
          <textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            disabled={locked}
            rows={5}
            className="w-full bg-transparent text-[11px] text-foreground/80 leading-relaxed resize-none outline-none disabled:opacity-50 font-mono"
          />
        </div>

        {compile.error && !compile.rendering && (
          <div className="flex items-center gap-3">
            <p className="text-xs text-red-400">{compile.error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={disabled}
                className="text-xs text-primary hover:text-primary border border-primary/30 hover:border-primary/50 rounded-lg px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {hasVideo && !compile.rendering ? (
          <div className="flex items-center gap-2 flex-wrap">
            {compile.approved ? (
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
                ✓ In timeline
              </span>
            ) : (
              <button
                type="button"
                onClick={onApproveShot}
                disabled={disabled || !onApproveShot}
                className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
                Approve shot
              </button>
            )}
            {!compile.approved && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={disabled}
                className="text-xs text-muted-foreground/60 hover:text-muted-foreground border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Regenerate
              </button>
            )}
          </div>
        ) : !compile.error ? (
          <button
            type="button"
            onClick={() => onApproveRender(editedPrompt)}
            disabled={locked || !editedPrompt.trim()}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary border border-primary/30 hover:border-primary/50 rounded-lg py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            {compile.rendering ? "Rendering…" : "Approve & Render"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
