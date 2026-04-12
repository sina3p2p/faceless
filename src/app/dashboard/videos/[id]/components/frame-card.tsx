"use client";

import { useEffect, useState } from "react";
import { VIDEO_MODELS } from "@/lib/constants";
import type { SceneFrame, FrameVariant } from "../types";

export function FrameCard({
  frame,
  frameIndex,
  generating,
  generatingVideo,
  generatingMotion: generatingMotionProp,
  showActions,
  showMotion,
  showVideo,
  onGenerateImage,
  onUpdatePrompt,
  onUpdateMotion,
  onRegenerateMotion,
  onRegenerateVideo,
  onSelectVariant,
  defaultVideoModel,
}: {
  frame: SceneFrame;
  frameIndex: number;
  generating: boolean;
  generatingVideo?: boolean;
  generatingMotion?: boolean;
  showActions: boolean;
  showMotion?: boolean;
  showVideo?: boolean;
  onGenerateImage?: (frameId: string, prompt?: string) => void;
  onUpdatePrompt?: (frameId: string, prompt: string) => void;
  onUpdateMotion?: (frameId: string, motion: string) => void;
  onRegenerateMotion?: (frameId: string) => void;
  onRegenerateVideo?: (frameId: string, videoModel?: string) => void;
  onSelectVariant?: (frameId: string, variantId: string, type: "image" | "video") => void;
  defaultVideoModel?: string;
}) {
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(frame.imagePrompt || "");
  const [editingMotion, setEditingMotion] = useState(false);
  const [motionText, setMotionText] = useState(frame.visualDescription || "");
  const [showVideoRegen, setShowVideoRegen] = useState(false);
  const [selectedVideoModel, setSelectedVideoModel] = useState(defaultVideoModel || "");

  useEffect(() => {
    setPromptText(frame.imagePrompt || "");
  }, [frame.imagePrompt]);

  useEffect(() => {
    setMotionText(frame.visualDescription || "");
  }, [frame.visualDescription]);

  const imageVariants = frame.imageVariants ?? [];
  const videoVariants = frame.videoVariants ?? [];
  const hasImageVariants = imageVariants.length > 0;
  const hasVideoVariants = videoVariants.length > 0;

  return (
    <div className="rounded-lg bg-white/2 border border-white/5 px-3 py-2 relative before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-full before:bg-linear-to-b before:from-violet-500/40 before:via-violet-500/20 before:to-violet-500/40">
      <div className="flex items-center gap-2 mb-1 pl-1.5">
        <span className="text-[10px] uppercase tracking-wider text-violet-500 font-medium">Frame {frameIndex + 1}</span>
        {frame.clipDuration && (
          <span className="text-[10px] text-gray-600 font-mono">{frame.clipDuration}s</span>
        )}
        {frame.modelUsed && (
          <span className="text-[9px] text-gray-700 ml-auto">{frame.modelUsed}</span>
        )}
        {generating && (
          <div className="animate-spin w-3 h-3 border border-violet-400 border-t-transparent rounded-full ml-auto" />
        )}
      </div>

      {/* Image prompt */}
      {editingPrompt ? (
        <textarea
          value={promptText}
          onChange={(e) => setPromptText(e.target.value)}
          onBlur={() => {
            setEditingPrompt(false);
            if (promptText !== (frame.imagePrompt || "") && onUpdatePrompt) {
              onUpdatePrompt(frame.id, promptText);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setPromptText(frame.imagePrompt || ""); setEditingPrompt(false); }
          }}
          autoFocus
          rows={3}
          className="w-full mt-1 bg-black/40 border border-violet-500/20 rounded-lg px-3 py-2 text-xs text-gray-300 resize-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none"
        />
      ) : frame.imagePrompt ? (
        <p
          className={`text-xs text-gray-500 leading-relaxed ${showActions ? "cursor-text hover:text-gray-400 transition-colors" : ""}`}
          onClick={(e) => { if (showActions) { e.stopPropagation(); setEditingPrompt(true); } }}
        >
          {frame.imagePrompt}
        </p>
      ) : null}

      {/* Current image + variant carousel */}
      {frame.imageUrl && (
        <div className="mt-1.5">
          <div className="relative group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frame.imageUrl} alt={`Frame ${frameIndex + 1}`} className="rounded w-full max-h-40 object-cover" />
            {showActions && !generating && (
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateImage?.(frame.id); }}
                  className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600"
                  title="Generate a new variant (keeps current)"
                >
                  + Variant
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onGenerateImage?.(frame.id); }}
                  className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600"
                >
                  Regenerate
                </button>
              </div>
            )}
            {hasImageVariants && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/80 font-medium">
                {imageVariants.length + 1} takes
              </div>
            )}
          </div>

          {/* Image variant strip */}
          {hasImageVariants && (
            <VariantStrip
              variants={imageVariants}
              currentUrl={frame.imageUrl}
              type="image"
              frameId={frame.id}
              onSelect={onSelectVariant}
            />
          )}
        </div>
      )}

      {/* Motion description */}
      {(showMotion || frame.visualDescription) && (
        <div className="mt-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium">Motion</span>
            {onRegenerateMotion && !generatingMotionProp && frame.imageUrl && (
              <button
                onClick={(e) => { e.stopPropagation(); onRegenerateMotion(frame.id); }}
                className="text-[10px] text-emerald-500/60 hover:text-emerald-400 transition-colors inline-flex items-center gap-0.5"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Regenerate
              </button>
            )}
            {generatingMotionProp && (
              <div className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                <div className="animate-spin w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full" />
                Generating...
              </div>
            )}
          </div>
          {editingMotion ? (
            <textarea
              value={motionText}
              onChange={(e) => setMotionText(e.target.value)}
              onBlur={() => {
                setEditingMotion(false);
                if (motionText !== (frame.visualDescription || "") && onUpdateMotion) {
                  onUpdateMotion(frame.id, motionText);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setMotionText(frame.visualDescription || ""); setEditingMotion(false); }
              }}
              autoFocus
              rows={2}
              className="w-full mt-0.5 bg-black/40 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-200 resize-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
            />
          ) : (
            <p
              className="text-xs text-emerald-400/70 cursor-text hover:text-emerald-300 transition-colors leading-relaxed mt-0.5"
              onClick={(e) => { e.stopPropagation(); setEditingMotion(true); }}
            >
              {frame.visualDescription || "Click to add motion description..."}
            </p>
          )}
        </div>
      )}

      {/* Video preview + variant strip */}
      {showVideo && frame.videoUrl && (
        <div className="mt-1.5">
          <div className="relative group">
            <video
              src={frame.videoUrl}
              className="rounded w-full max-h-40 object-cover bg-black"
              muted
              loop
              playsInline
              onMouseEnter={(e) => e.currentTarget.play()}
              onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
            />
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-green-500/80 text-white text-[9px] font-bold uppercase">
              Video Ready
            </div>
            {onRegenerateVideo && !generatingVideo && (
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowVideoRegen(!showVideoRegen); }}
                  className="px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] hover:bg-violet-600"
                >
                  + Video Variant
                </button>
              </div>
            )}
            {hasVideoVariants && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/80 font-medium">
                {videoVariants.length + 1} takes
              </div>
            )}
          </div>

          {/* Video variant strip */}
          {hasVideoVariants && (
            <VariantStrip
              variants={videoVariants}
              currentUrl={frame.videoUrl}
              type="video"
              frameId={frame.id}
              onSelect={onSelectVariant}
            />
          )}

          {showVideoRegen && !generatingVideo && (
            <VideoModelSelector
              selectedModel={selectedVideoModel}
              onSelectModel={setSelectedVideoModel}
              onGenerate={() => { onRegenerateVideo?.(frame.id, selectedVideoModel || undefined); setShowVideoRegen(false); }}
              onCancel={() => setShowVideoRegen(false)}
            />
          )}
        </div>
      )}

      {showVideo && !frame.videoUrl && frame.imageUrl && !generatingVideo && (
        <div className="mt-1.5">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 text-[9px] font-bold uppercase">
              No Video
            </span>
            {onRegenerateVideo && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowVideoRegen(!showVideoRegen); }}
                className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
              >
                Generate Video
              </button>
            )}
          </div>
          {showVideoRegen && (
            <VideoModelSelector
              selectedModel={selectedVideoModel}
              onSelectModel={setSelectedVideoModel}
              onGenerate={() => { onRegenerateVideo?.(frame.id, selectedVideoModel || undefined); setShowVideoRegen(false); }}
              onCancel={() => setShowVideoRegen(false)}
            />
          )}
        </div>
      )}

      {generatingVideo && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-400">
          <div className="animate-spin w-3 h-3 border border-amber-400 border-t-transparent rounded-full" />
          Generating video clip...
        </div>
      )}

      {!frame.imageUrl && showActions && !generating && (
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onGenerateImage?.(frame.id); }}
            className="text-[10px] text-violet-400 hover:text-violet-300 transition-colors"
          >
            Generate Image
          </button>
          {frame.imagePrompt && (
            <button
              onClick={(e) => { e.stopPropagation(); setEditingPrompt(true); }}
              className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
            >
              Edit Prompt
            </button>
          )}
        </div>
      )}

      {!frame.imageUrl && generating && (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-violet-400">
          <div className="animate-spin w-2.5 h-2.5 border border-violet-400 border-t-transparent rounded-full" />
          Generating...
        </div>
      )}
    </div>
  );
}

// ── Variant thumbnail strip ──

function VariantStrip({
  variants,
  currentUrl,
  type,
  frameId,
  onSelect,
}: {
  variants: FrameVariant[];
  currentUrl: string;
  type: "image" | "video";
  frameId: string;
  onSelect?: (frameId: string, variantId: string, type: "image" | "video") => void;
}) {
  return (
    <div className="flex gap-1 mt-1.5 overflow-x-auto pb-1 scrollbar-thin">
      {/* Current (active) */}
      <div className="relative shrink-0 rounded border-2 border-violet-500 ring-1 ring-violet-500/30 overflow-hidden">
        {type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentUrl} alt="Current" className="w-10 h-10 object-cover" />
        ) : (
          <video src={currentUrl} className="w-10 h-10 object-cover" muted />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-violet-500/20">
          <svg className="w-3 h-3 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>

      {/* Previous variants */}
      {variants.map((v) => (
        <button
          key={v.id}
          onClick={(e) => { e.stopPropagation(); onSelect?.(frameId, v.id, type); }}
          className="relative shrink-0 rounded border-2 border-white/10 overflow-hidden opacity-60 hover:opacity-100 hover:border-white/30 transition-all group/variant"
          title={`${v.modelUsed || "Unknown"} — ${new Date(v.createdAt).toLocaleTimeString()} — Click to use`}
        >
          {type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.url} alt="" className="w-10 h-10 object-cover" />
          ) : (
            <video src={v.url} className="w-10 h-10 object-cover" muted />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/variant:opacity-100 transition-opacity">
            <span className="text-[8px] text-white font-semibold">Use</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Video model selector ──

function VideoModelSelector({
  selectedModel,
  onSelectModel,
  onGenerate,
  onCancel,
}: {
  selectedModel: string;
  onSelectModel: (id: string) => void;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-1.5 rounded-lg bg-black/30 border border-white/10 p-2 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {VIDEO_MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelectModel(m.id); }}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${selectedModel === m.id
              ? "bg-violet-600 text-white"
              : "bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:border-white/20"
            }`}
            title={m.description}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); onGenerate(); }}
          className="px-2.5 py-1 rounded-lg bg-violet-600 text-white text-[10px] font-medium hover:bg-violet-500 transition-colors"
        >
          Generate
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          className="px-2.5 py-1 rounded-lg bg-white/5 text-gray-400 text-[10px] font-medium hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
