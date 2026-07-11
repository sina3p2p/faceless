"use client";

import { useState } from "react";
import type { ShotCompile } from "@/types/v2/story";

const MODE_LABEL: Record<NonNullable<ShotCompile["continuityMode"]>, string> = {
  fresh: "Fresh (stills)",
  extend_video: "Extend prior clip",
};

export function ShotCompilePanel({
  compile,
  disabled,
  onApprove,
}: {
  compile: ShotCompile;
  disabled?: boolean;
  onApprove: (renderPrompt: string) => void;
}) {
  const [editedPrompt, setEditedPrompt] = useState(compile.renderPrompt ?? "");
  const refs = compile.referenceImageUrls ?? [];
  const mode = compile.continuityMode ?? "fresh";

  if (compile.loading) {
    return <p className="text-xs text-muted-foreground/40 italic animate-pulse">Compiling shot prompt…</p>;
  }

  return (
    <div className="mt-1 rounded-xl border border-white/10 overflow-hidden">
      <div
        className="bg-background/40 backdrop-blur-sm flex items-center justify-center"
        style={{ aspectRatio: "16/9" }}
      >
        <svg className="w-8 h-8 text-white/20" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>

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
        </div>

        {refs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              References sent to video model
            </p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {refs.map((url, i) => (
                <div
                  key={`${url}-${i}`}
                  className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-white/5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Image${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-center text-white/80 py-0.5">
                    Image{i + 1}
                  </span>
                </div>
              ))}
            </div>
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
            disabled={disabled}
            rows={5}
            className="w-full bg-transparent text-[11px] text-foreground/80 leading-relaxed resize-none outline-none disabled:opacity-50 font-mono"
          />
        </div>

        <button
          onClick={() => onApprove(editedPrompt)}
          disabled={disabled || !editedPrompt.trim()}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:text-primary border border-primary/30 hover:border-primary/50 rounded-lg py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
          Approve & Render
        </button>
      </div>
    </div>
  );
}
