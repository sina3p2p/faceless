"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Clip = {
  toolCallId: string;
  videoUrl: string;
  approved?: boolean;
};

type InternalClip = {
  id: string;
  sourceId: string;
  videoUrl: string;
  approved?: boolean;
  trimStart: number;
  trimEnd: number | null;
  reversed: boolean;
};

type ToolTab = "speed" | "volume" | "text" | "audio" | "effects" | "export";
type SpeedMode = "normal" | "curve";
type CurvePoint = { x: number; y: number }; // both 0–1; y=0→0.1×, y=0.5→1×, y=1→10×

// ─── Curve helpers (outside component for stable refs) ────────────────────────

function speedFromY(y: number): number { return Math.pow(10, y * 2 - 1); }

function getCurveSpeedAt(pts: CurvePoint[], t: number): number {
  if (pts.length === 0) return 1;
  if (t <= pts[0].x) return speedFromY(pts[0].y);
  if (t >= pts[pts.length - 1].x) return speedFromY(pts[pts.length - 1].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (t >= a.x && t <= b.x) {
      const u = (t - a.x) / (b.x - a.x);
      const p0 = i > 0 ? pts[i - 1] : a;
      const p3 = i + 2 < pts.length ? pts[i + 2] : b;
      const y = 0.5 * ((2 * a.y) + (-p0.y + b.y) * u + (2*p0.y - 5*a.y + 4*b.y - p3.y) * u*u + (-p0.y + 3*a.y - 3*b.y + p3.y) * u*u*u);
      return speedFromY(Math.max(0.001, Math.min(1, y)));
    }
  }
  return 1;
}

function computeCurveDuration(pts: CurvePoint[], raw: number): number {
  const N = 200;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += 1 / getCurveSpeedAt(pts, i / N);
  return raw * sum / N;
}

function buildCurveSvgPath(pts: CurvePoint[], W: number, H: number, pL: number, pR: number, pT: number, pB: number): string {
  if (pts.length < 2) return "";
  const mx = (x: number) => pL + x * (W - pL - pR);
  const my = (y: number) => H - pB - y * (H - pT - pB);
  const ext = [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M ${mx(ext[1].x)} ${my(ext[1].y)}`;
  for (let i = 1; i < ext.length - 2; i++) {
    const p0 = ext[i-1], p1 = ext[i], p2 = ext[i+1], p3 = ext[i+2];
    d += ` C ${mx(p1.x + (p2.x - p0.x) / 6)} ${my(p1.y + (p2.y - p0.y) / 6)}, ${mx(p2.x - (p3.x - p1.x) / 6)} ${my(p2.y - (p3.y - p1.y) / 6)}, ${mx(p2.x)} ${my(p2.y)}`;
  }
  return d;
}

const CURVE_PRESETS: { id: string; label: string; points: CurvePoint[]; icon: string }[] = [
  { id: "none",      label: "None",     points: [{x:0,y:0.5},{x:1,y:0.5}], icon: "M 5 20 L 55 20" },
  { id: "montage",   label: "Montage",  points: [{x:0,y:0.5},{x:0.15,y:0.5},{x:0.32,y:0.76},{x:0.55,y:0.24},{x:0.72,y:0.5},{x:1,y:0.5}], icon: "M 5 20 C 11 20 15 8 25 8 C 36 8 39 32 46 32 C 51 32 52 20 55 20" },
  { id: "hero",      label: "Hero",     points: [{x:0,y:0.5},{x:0.2,y:0.5},{x:0.36,y:0.82},{x:0.62,y:0.18},{x:0.78,y:0.5},{x:1,y:0.5}], icon: "M 5 20 C 13 20 19 5 29 5 C 40 5 43 35 49 35 C 53 35 54 20 55 20" },
  { id: "bullet",    label: "Bullet",   points: [{x:0,y:0.5},{x:0.25,y:0.5},{x:0.5,y:0.1},{x:0.75,y:0.5},{x:1,y:0.5}], icon: "M 5 20 C 13 20 20 37 30 37 C 40 37 46 20 55 20" },
  { id: "jump-cut",  label: "Jump Cut", points: [{x:0,y:0.5},{x:0.3,y:0.5},{x:0.38,y:0.8},{x:0.46,y:0.5},{x:1,y:0.5}], icon: "M 5 20 L 22 20 C 26 20 28 7 30 7 C 32 7 34 20 38 20 L 55 20" },
  { id: "flash-in",  label: "Flash In", points: [{x:0,y:0.5},{x:0.58,y:0.5},{x:0.74,y:0.76},{x:1,y:0.76}], icon: "M 5 20 L 34 20 C 43 20 48 8 55 8" },
  { id: "flash-out", label: "Flash Out",points: [{x:0,y:0.76},{x:0.26,y:0.76},{x:0.42,y:0.5},{x:1,y:0.5}], icon: "M 5 8 C 12 8 17 20 26 20 L 55 20" },
  { id: "custom",    label: "Custom",   points: [], icon: "" },
];

interface VideoEditorPanelProps {
  clips: Clip[];
  onReorderClips: (newOrder: string[]) => void;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toInternalClip(c: Clip): InternalClip {
  return { id: c.toolCallId, sourceId: c.toolCallId, videoUrl: c.videoUrl, approved: c.approved, trimStart: 0, trimEnd: null, reversed: false };
}

// ─── usePointerDrag — borrowed pattern from react-video-editor ────────────────
// Attaches global pointermove/pointerup once; callbacks are kept in refs so the
// effect never needs to re-run. The generic state T carries per-drag context.

function usePointerDrag<T>(
  onMove: (state: T, ev: { clientX: number; clientY: number }) => void,
  onEnd?: (state: T) => void,
) {
  const moveRef = useRef(onMove);
  const endRef = useRef(onEnd);
  useLayoutEffect(() => {
    moveRef.current = onMove;
    endRef.current = onEnd;
  });

  const stateRef = useRef<T | null>(null);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (stateRef.current === null) return;
      moveRef.current(stateRef.current, { clientX: e.clientX, clientY: e.clientY });
    }
    function handleUp() {
      if (stateRef.current !== null) {
        endRef.current?.(stateRef.current);
        stateRef.current = null;
      }
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  return function startDrag(state: T, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    stateRef.current = state;
  };
}

// ─── Filmstrip ────────────────────────────────────────────────────────────────

const FILMSTRIP_TILES = 6;

// ─── Sortable clip block ──────────────────────────────────────────────────────

function TrimHandle({ edge, onPointerDown }: { edge: "start" | "end"; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPointerDown(e); }}
      className={`absolute top-0 bottom-0 w-3 z-10 flex items-center justify-center cursor-ew-resize group/h ${
        edge === "start" ? "left-0" : "right-0"
      }`}
    >
      {/* visible bar */}
      <div className="w-[3px] h-9 rounded-full bg-white/30 group-hover/h:bg-white transition-colors" />
      {/* notch dots */}
      <div className="absolute flex flex-col gap-[3px] pointer-events-none">
        <div className="w-[3px] h-[3px] rounded-full bg-white/70 group-hover/h:bg-white" />
        <div className="w-[3px] h-[3px] rounded-full bg-white/70 group-hover/h:bg-white" />
        <div className="w-[3px] h-[3px] rounded-full bg-white/70 group-hover/h:bg-white" />
      </div>
    </div>
  );
}

// Layout constants — single source of truth for track heights and offsets
const RULER_H = 28;
const VIDEO_TRACK_H = 88;
const AUDIO_TRACK_H = 52;
const TEXT_TRACK_H = 34;
const FOOTER_H = 28;
const LABEL_W = 52;
const TIMELINE_H = RULER_H + VIDEO_TRACK_H + AUDIO_TRACK_H + TEXT_TRACK_H + FOOTER_H; // 230

function SortableClipBlock({
  clip,
  index,
  clipLeft,
  width,
  isSelected,
  isActive,
  duration,
  rawDuration,
  onClick,
  onTrimHandlePointerDown,
}: {
  clip: InternalClip;
  index: number;
  clipLeft: number;
  width: number;
  isSelected: boolean;
  isActive: boolean;
  duration: number;
  rawDuration: number;
  onClick: () => void;
  onTrimHandlePointerDown: (e: React.PointerEvent, edge: "start" | "end") => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id });

  const isTrimmed = clip.trimStart > 0 || clip.trimEnd !== null;
  const w = Math.max(width, 24);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: "absolute",
        left: clipLeft,
        top: 4,
        bottom: 4,
        width: w,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 20 : isSelected ? 10 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`rounded-md border-2 cursor-grab active:cursor-grabbing overflow-hidden select-none transition-[border,box-shadow] ${
        isSelected ? "border-violet-500 ring-2 ring-violet-500/30"
          : isActive ? "border-violet-400/60"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 to-indigo-950/80" />
      {rawDuration > 0 ? (
        <div className="absolute inset-0 flex overflow-hidden">
          {Array.from({ length: FILMSTRIP_TILES }, (_, i) => {
            const pos = FILMSTRIP_TILES > 1 ? i / (FILMSTRIP_TILES - 1) : 0;
            const trimEnd = clip.trimEnd ?? rawDuration;
            const seekTime = clip.trimStart + pos * (trimEnd - clip.trimStart);
            return (
              <div
                key={i}
                className={`relative flex-1 h-full overflow-hidden${i < FILMSTRIP_TILES - 1 ? " border-r border-black/50" : ""}`}
              >
                <video
                  src={clip.videoUrl}
                  className="absolute inset-0 w-full h-full object-cover opacity-80"
                  muted
                  playsInline
                  preload="metadata"
                  ref={(el) => {
                    if (!el) return;
                    const ve = el as HTMLVideoElement & { _filmseek?: number };
                    if (ve._filmseek === seekTime) return;
                    ve._filmseek = seekTime;
                    const doSeek = () => {
                      el.currentTime = Math.max(0, Math.min(seekTime, (el.duration || rawDuration) - 0.01));
                    };
                    if (el.readyState >= 1) doSeek();
                    else el.addEventListener("loadedmetadata", doSeek, { once: true });
                  }}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <video src={clip.videoUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" preload="metadata" muted />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* clip number */}
      <span className="absolute top-1 left-3 text-[9px] font-bold text-white/80 bg-black/50 px-1 py-0.5 rounded">
        {index + 1}
      </span>

      {/* badges */}
      <div className="absolute top-1 right-3 flex items-center gap-1">
        {clip.reversed && (
          <span className="text-[8px] font-bold text-amber-400 bg-black/60 px-1 py-0.5 rounded">REV</span>
        )}
        {clip.approved && (
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
            <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          </span>
        )}
      </div>

      {duration > 0 && (
        <span className="absolute bottom-1 right-3 text-[9px] font-mono text-white/70 bg-black/50 px-1 rounded">
          {duration.toFixed(1)}s
        </span>
      )}

      {/* Trim accent lines on edges when trimmed */}
      {isTrimmed && clip.trimStart > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-sky-400/70" />
      )}
      {isTrimmed && clip.trimEnd !== null && (
        <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-sky-400/70" />
      )}

      {/* Trim handles — only visible on select or hover */}
      <div className={`absolute inset-0 transition-opacity ${isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"}`}>
        <TrimHandle edge="start" onPointerDown={(e) => onTrimHandlePointerDown(e, "start")} />
        <TrimHandle edge="end" onPointerDown={(e) => onTrimHandlePointerDown(e, "end")} />
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function VideoEditorPanel({ clips, onReorderClips, selectedClipId, onSelectClip }: VideoEditorPanelProps) {
  const [internalClips, setInternalClips] = useState<InternalClip[]>(() => clips.map(toInternalClip));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [clipMeta, setClipMeta] = useState<Map<string, number>>(new Map());
  const [pxPerSec, setPxPerSec] = useState(80);
  const [activeTab, setActiveTab] = useState<ToolTab>("speed");
  const [clipSpeeds, setClipSpeeds] = useState<Map<string, number>>(new Map());
  const [clipVolumes, setClipVolumes] = useState<Map<string, number>>(new Map());
  const [clipSpeedModes, setClipSpeedModes] = useState<Map<string, SpeedMode>>(new Map());
  const [clipCurvePoints, setClipCurvePoints] = useState<Map<string, CurvePoint[]>>(new Map());
  const [clipCurvePresets, setClipCurvePresets] = useState<Map<string, string>>(new Map());

  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)] as const;
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const activeSlotRef = useRef<0 | 1>(0);
  activeSlotRef.current = activeSlot;

  const timelineRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const loadedUrlRef = useRef<string | null>(null);

  // Always-fresh ref so timeupdate callbacks never see stale trim values
  const internalClipsRef = useRef(internalClips);
  internalClipsRef.current = internalClips;

  // Refs that need to stay current inside stable usePointerDrag closures
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;
  const totalDurationRef = useRef(0); // updated after totalDuration is computed
  const seekToRef = useRef<(t: number) => void>(() => {}); // updated after seekTo is defined

  // Trim drag tooltip
  const [trimTooltip, setTrimTooltip] = useState<{ x: number; y: number; time: number } | null>(null);

  // Playhead local state — tracks position during drag for instant visual feedback
  const [localPlayheadTime, setLocalPlayheadTime] = useState<number | null>(null);
  const displayTime = localPlayheadTime ?? currentTime;

  // Pending scroll target after a zoom change (cursor-anchored zoom)
  const pendingScrollRef = useRef<number | null>(null);

  function getActiveVideo() { return videoRefs[activeSlotRef.current].current; }
  function getInactiveVideo() { return videoRefs[(1 - activeSlotRef.current) as 0 | 1].current; }

  // ── sync internalClips from props ─────────────────────────────────────────

  useEffect(() => {
    setInternalClips((prev) => {
      const validSourceIds = new Set(clips.map((c) => c.toolCallId));
      const filtered = prev.filter((c) => validSourceIds.has(c.sourceId));
      const updated = filtered.map((c) => {
        const src = clips.find((s) => s.toolCallId === c.sourceId);
        return src ? { ...c, videoUrl: src.videoUrl, approved: src.approved } : c;
      });
      const existingSourceIds = new Set(updated.map((c) => c.sourceId));
      const newClips = clips.filter((c) => !existingSourceIds.has(c.toolCallId)).map(toInternalClip);
      return [...updated, ...newClips];
    });
  }, [clips]);

  // ── derived ───────────────────────────────────────────────────────────────

  const getRawDuration = useCallback((id: string) => clipMeta.get(id) ?? 0, [clipMeta]);

  const getEffectiveDuration = useCallback((clip: InternalClip) => {
    const raw = getRawDuration(clip.id);
    if (!raw) return 0;
    const end = clip.trimEnd ?? raw;
    return Math.max(0, end - clip.trimStart);
  }, [getRawDuration]);

  const clipOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const c of internalClips) { offsets.push(acc); acc += getEffectiveDuration(c); }
    return offsets;
  }, [internalClips, getEffectiveDuration]);

  const totalDuration = useMemo(
    () => internalClips.reduce((sum, c) => sum + getEffectiveDuration(c), 0),
    [internalClips, getEffectiveDuration]
  );
  totalDurationRef.current = totalDuration;

  // ── playback ──────────────────────────────────────────────────────────────

  function loadClip(clip: InternalClip, localEffTime: number, forcePlay?: boolean, into?: HTMLVideoElement | null) {
    const video = into ?? getActiveVideo();
    if (!video) return;
    if (!into) loadedUrlRef.current = clip.videoUrl;
    video.src = clip.videoUrl;
    video.playbackRate = clipSpeeds.get(clip.id) ?? 1;
    video.volume = clipVolumes.get(clip.id) ?? 1;
    video.load();
    const shouldPlay = forcePlay !== undefined ? forcePlay : isPlayingRef.current;
    const targetTime = clip.trimStart + localEffTime;
    video.addEventListener("loadedmetadata", () => {
      video.currentTime = Math.max(targetTime, 0.001);
      if (shouldPlay) video.play().catch(() => {});
    }, { once: true });
  }

  useEffect(() => {
    const clip = internalClips[activeClipIndex];
    const url = clip?.videoUrl ?? null;
    if (loadedUrlRef.current === url) return;
    if (!clip) { loadedUrlRef.current = null; return; }
    const localEffTime = Math.max(0, currentTime - (clipOffsets[activeClipIndex] ?? 0));
    loadClip(clip, localEffTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipIndex, internalClips]);

  useEffect(() => {
    const nextClip = internalClips[activeClipIndex + 1];
    const inactive = getInactiveVideo();
    if (!inactive || !nextClip) return;
    const seekToStart = () => { inactive.currentTime = nextClip.trimStart; };
    if (inactive.src !== nextClip.videoUrl) {
      inactive.muted = true;
      inactive.src = nextClip.videoUrl;
      inactive.load();
      inactive.addEventListener("loadedmetadata", seekToStart, { once: true });
    } else if (Math.abs(inactive.currentTime - nextClip.trimStart) > 0.05) {
      // Same URL (e.g. split clip) but wrong position — seek it now
      seekToStart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipIndex, internalClips, activeSlot]);

  function handleTimeUpdate() {
    const video = getActiveVideo();
    if (!video || isSeekingRef.current) return;
    // Read from ref so we always get the latest trim values even mid-drag
    const clip = internalClipsRef.current[activeClipIndex];
    if (!clip) return;

    // Enforce trim start — if audio has drifted before the in-point, snap back
    if (video.currentTime < clip.trimStart) {
      video.currentTime = clip.trimStart + 0.001;
      return;
    }

    // Check trim end
    const raw = getRawDuration(clip.id);
    const trimEnd = clip.trimEnd ?? raw;
    if (clip.trimEnd !== null && video.currentTime >= clip.trimEnd) {
      handleEnded();
      return;
    }

    // Apply speed curve
    const speedMode = clipSpeedModes.get(clip.id) ?? "normal";
    if (isPlaying) {
      const eff = getEffectiveDuration(clip);
      const progress = eff > 0 ? (video.currentTime - clip.trimStart) / eff : 0;
      if (speedMode === "curve") {
        const pts = clipCurvePoints.get(clip.id) ?? CURVE_PRESETS[0].points;
        video.playbackRate = Math.max(0.05, Math.min(getCurveSpeedAt(pts, progress), 16));
      }
    }

    const localEffTime = video.currentTime - clip.trimStart;
    setCurrentTime((clipOffsets[activeClipIndex] ?? 0) + localEffTime);
  }

  function handleEnded() {
    const next = activeClipIndex + 1;
    if (next < internalClips.length) {
      const nextClip = internalClips[next]!;
      const nextSlot = (1 - activeSlotRef.current) as 0 | 1;
      const inactive = getInactiveVideo();
      if (inactive) {
        inactive.muted = false;
        inactive.volume = clipVolumes.get(nextClip.id) ?? 1;
        inactive.playbackRate = clipSpeeds.get(nextClip.id) ?? 1;
        const doPlay = () => {
          const target = nextClip.trimStart;
          const startPlaying = () => inactive.play().catch(() => {});
          if (Math.abs(inactive.currentTime - target) < 0.05) {
            // Already at the right position, play immediately
            startPlaying();
          } else {
            inactive.currentTime = target;
            inactive.addEventListener("seeked", startPlaying, { once: true });
          }
        };
        if (inactive.readyState >= 1) doPlay();
        else inactive.addEventListener("loadedmetadata", doPlay, { once: true });
      }
      loadedUrlRef.current = nextClip.videoUrl;
      setActiveSlot(nextSlot);
      setCurrentTime(clipOffsets[next] ?? 0);
      setActiveClipIndex(next);
    } else {
      setIsPlaying(false);
      setCurrentTime(0);
      setActiveClipIndex(0);
      loadedUrlRef.current = null;
    }
  }

  function togglePlay() {
    const video = getActiveVideo();
    if (!video || internalClips.length === 0) return;
    if (isPlaying) {
      video.pause();
    } else {
      if (currentTime >= totalDuration && totalDuration > 0) { seekTo(0); return; }
      // Snap to trimStart if the video is sitting before the in-point
      const clip = internalClips[activeClipIndex];
      if (clip && video.currentTime < clip.trimStart) {
        video.currentTime = clip.trimStart + 0.001;
      }
      video.play().catch(() => {});
    }
  }

  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    let newIdx = 0;
    for (let i = internalClips.length - 1; i >= 0; i--) {
      if (clamped >= (clipOffsets[i] ?? 0)) { newIdx = i; break; }
    }
    isSeekingRef.current = true;
    setCurrentTime(clamped);
    const video = getActiveVideo();
    const clip = internalClips[newIdx];
    const localEffTime = clamped - (clipOffsets[newIdx] ?? 0);
    if (newIdx === activeClipIndex && video && clip) {
      video.currentTime = clip.trimStart + localEffTime;
    } else {
      setActiveClipIndex(newIdx);
    }
    setTimeout(() => { isSeekingRef.current = false; }, 50);
  }
  seekToRef.current = seekTo;

  // ── transport ─────────────────────────────────────────────────────────────

  function goToStart() { setActiveClipIndex(0); setCurrentTime(0); const v = getActiveVideo(); if (v) v.currentTime = internalClips[0]?.trimStart ?? 0; }
  function goToEnd() { seekTo(totalDuration); }
  function prevClip() { seekTo(clipOffsets[Math.max(0, activeClipIndex - 1)] ?? 0); }
  function nextClip() { seekTo(clipOffsets[Math.min(internalClips.length - 1, activeClipIndex + 1)] ?? 0); }

  // ── timeline click ────────────────────────────────────────────────────────

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    seekTo((x - 48) / pxPerSec);
  }

  // ── dnd ───────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = internalClips.map((c) => c.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    const reordered = arrayMove(internalClips, oldIdx, newIdx);
    setInternalClips(reordered);
    reportOrder(reordered);
  }

  function reportOrder(list: InternalClip[]) {
    const seen = new Set<string>();
    const order = list.map((c) => c.sourceId).filter((id) => { if (seen.has(id)) return false; seen.add(id); return true; });
    onReorderClips(order);
  }

  // ── trim drag (via usePointerDrag) ───────────────────────────────────────

  type TrimDragState = {
    clipId: string;
    edge: "start" | "end";
    startX: number;
    initialValue: number;
    rawDuration: number;
    otherEdge: number;
  };

  const startTrimDrag = usePointerDrag<TrimDragState>(
    (state, { clientX, clientY }) => {
      const deltaTime = (clientX - state.startX) / pxPerSecRef.current;
      const clamped = state.edge === "start"
        ? Math.max(0, Math.min(state.initialValue + deltaTime, state.otherEdge - 0.15))
        : Math.max(state.otherEdge + 0.15, Math.min(state.initialValue + deltaTime, state.rawDuration));
      setInternalClips((prev) => prev.map((c) => {
        if (c.id !== state.clipId) return c;
        if (state.edge === "start") return { ...c, trimStart: clamped };
        return { ...c, trimEnd: clamped >= state.rawDuration ? null : clamped };
      }));
      setTrimTooltip({ x: clientX, y: clientY, time: clamped });
    },
    (state) => {
      // Snap active video into new trim window on release
      const video = videoRefs[activeSlotRef.current].current;
      if (video) {
        const clip = internalClipsRef.current.find((c) => c.id === state.clipId);
        if (clip) {
          const raw = clip.trimEnd !== null ? clip.trimEnd : video.duration;
          if (video.currentTime < clip.trimStart) video.currentTime = clip.trimStart + 0.001;
          else if (isFinite(raw) && video.currentTime > raw) video.currentTime = Math.max(clip.trimStart, raw - 0.001);
        }
      }
      setTrimTooltip(null);
    },
  );

  function handleTrimHandlePointerDown(e: React.PointerEvent, clip: InternalClip, edge: "start" | "end") {
    const raw = getRawDuration(clip.id);
    const initialValue = edge === "start" ? clip.trimStart : (clip.trimEnd ?? raw);
    const otherEdge = edge === "start" ? (clip.trimEnd ?? raw) : clip.trimStart;
    onSelectClip(clip.id);
    startTrimDrag({ clipId: clip.id, edge, startX: e.clientX, initialValue, rawDuration: raw, otherEdge }, e);
  }

  // ── playhead drag (via usePointerDrag) ────────────────────────────────────

  type PlayheadDragState = { startX: number; startTime: number };

  const startPlayheadDrag = usePointerDrag<PlayheadDragState>(
    (state, { clientX }) => {
      const t = Math.max(0, Math.min(state.startTime + (clientX - state.startX) / pxPerSecRef.current, totalDurationRef.current));
      setLocalPlayheadTime(t);
    },
    (state) => {
      // Commit final position on release
      const finalTime = localPlayheadTimeRef.current;
      setLocalPlayheadTime(null);
      if (finalTime !== null) seekToRef.current(finalTime);
    },
  );

  // Keep a ref to localPlayheadTime so the onEnd closure above can read it
  const localPlayheadTimeRef = useRef<number | null>(null);
  localPlayheadTimeRef.current = localPlayheadTime;

  // ── wheel zoom (cursor-anchored) ──────────────────────────────────────────

  function handleTimelineWheel(e: React.WheelEvent) {
    if (!timelineRef.current) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = timelineRef.current.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const oldScroll = timelineRef.current.scrollLeft;
      const factor = Math.pow(0.998, e.deltaY);
      const newPx = Math.max(20, Math.min(300, pxPerSec * factor));
      // Keep the time-point under the cursor stationary
      const timeAtCursor = (cursorX + oldScroll - 48) / pxPerSec;
      pendingScrollRef.current = Math.max(0, timeAtCursor * newPx - cursorX + 48);
      setPxPerSec(Math.round(newPx));
    } else {
      timelineRef.current.scrollLeft += e.deltaY * 1.5;
    }
  }

  // Apply pending scroll after pxPerSec change re-renders the wider timeline
  useEffect(() => {
    if (pendingScrollRef.current !== null && timelineRef.current) {
      timelineRef.current.scrollLeft = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  }, [pxPerSec]);

  // ── per-clip controls ─────────────────────────────────────────────────────

  const selectedClip = internalClips.find((c) => c.id === selectedClipId) ?? null;

  function setSpeed(rate: number) {
    if (!selectedClipId) return;
    setClipSpeeds((prev) => new Map(prev).set(selectedClipId, rate));
    if (selectedClipId === internalClips[activeClipIndex]?.id) {
      const v = getActiveVideo();
      const inCurveMode = (clipSpeedModes.get(selectedClipId) ?? "normal") === "curve";
      if (v && !inCurveMode) v.playbackRate = rate;
    }
  }

  function setVolume(vol: number) {
    if (!selectedClipId) return;
    setClipVolumes((prev) => new Map(prev).set(selectedClipId, vol));
    if (selectedClipId === internalClips[activeClipIndex]?.id) {
      const v = getActiveVideo(); if (v) v.volume = vol;
    }
  }

  function setSpeedMode(mode: SpeedMode) {
    if (!selectedClipId) return;
    setClipSpeedModes((prev) => new Map(prev).set(selectedClipId, mode));
    if (mode === "normal") {
      const v = getActiveVideo();
      if (v && selectedClipId === internalClips[activeClipIndex]?.id)
        v.playbackRate = clipSpeeds.get(selectedClipId) ?? 1;
    }
  }

  function selectCurvePreset(id: string) {
    if (!selectedClipId) return;
    const preset = CURVE_PRESETS.find((p) => p.id === id);
    if (preset && preset.id !== "custom" && preset.points.length > 0) {
      setClipCurvePoints((prev) => new Map(prev).set(selectedClipId, [...preset.points]));
    }
    setClipCurvePresets((prev) => new Map(prev).set(selectedClipId, id));
  }

  const curveGraphRef = useRef<SVGSVGElement>(null);
  const GRAPH_VW = 500, GRAPH_VH = 160;
  const GP_L = 38, GP_R = 8, GP_T = 12, GP_B = 24;

  type CurvePtDrag = { idx: number; svgRect: DOMRect; clipId: string };

  const startCurvePtDrag = usePointerDrag<CurvePtDrag>(
    (state, { clientX, clientY }) => {
      const { idx, svgRect, clipId } = state;
      const svgX = (clientX - svgRect.left) * (GRAPH_VW / svgRect.width);
      const svgY = (clientY - svgRect.top) * (GRAPH_VH / svgRect.height);
      const nx = Math.max(0, Math.min(1, (svgX - GP_L) / (GRAPH_VW - GP_L - GP_R)));
      const ny = Math.max(0, Math.min(1, 1 - (svgY - GP_T) / (GRAPH_VH - GP_T - GP_B)));
      setClipCurvePoints((prev) => {
        const current = [...(prev.get(clipId) ?? [])];
        if (!current[idx]) return prev;
        const minX = idx > 0 ? current[idx - 1].x + 0.02 : 0;
        const maxX = idx < current.length - 1 ? current[idx + 1].x - 0.02 : 1;
        current[idx] = { x: Math.max(minX, Math.min(maxX, nx)), y: ny };
        return new Map(prev).set(clipId, current);
      });
      setClipCurvePresets((prev) => new Map(prev).set(clipId, "custom"));
    },
  );

  // ── split ─────────────────────────────────────────────────────────────────

  const canSplit = useMemo(() => {
    if (!selectedClipId) return false;
    const clipIdx = internalClips.findIndex((c) => c.id === selectedClipId);
    if (clipIdx < 0) return false;
    const clip = internalClips[clipIdx];
    const offset = clipOffsets[clipIdx] ?? 0;
    const localEffTime = currentTime - offset;
    const eff = getEffectiveDuration(clip);
    return localEffTime > 0.1 && localEffTime < eff - 0.1;
  }, [selectedClipId, internalClips, clipOffsets, currentTime, getEffectiveDuration]);

  function splitAtPlayhead() {
    if (!selectedClipId || !canSplit) return;
    const clipIdx = internalClips.findIndex((c) => c.id === selectedClipId);
    if (clipIdx < 0) return;
    const clip = internalClips[clipIdx];
    const offset = clipOffsets[clipIdx] ?? 0;
    const localEffTime = currentTime - offset;
    const rawSplitPoint = clip.trimStart + localEffTime;
    const raw = getRawDuration(clip.id);

    const part1: InternalClip = { ...clip, trimEnd: rawSplitPoint };
    const part2: InternalClip = { ...clip, id: `${clip.sourceId}-s${Date.now()}`, trimStart: rawSplitPoint };

    setClipMeta((prev) => new Map(prev).set(part2.id, raw));
    setInternalClips((prev) => {
      const next = [...prev];
      next.splice(clipIdx, 1, part1, part2);
      return next;
    });
    onSelectClip(part2.id);
  }

  // ── reverse ───────────────────────────────────────────────────────────────

  function toggleReverse() {
    if (!selectedClipId) return;
    setInternalClips((prev) => prev.map((c) =>
      c.id === selectedClipId ? { ...c, reversed: !c.reversed } : c
    ));
  }

  // ── delete ────────────────────────────────────────────────────────────────

  function deleteClip() {
    if (!selectedClipId) return;
    onSelectClip(null);
    setInternalClips((prev) => {
      const next = prev.filter((c) => c.id !== selectedClipId);
      reportOrder(next);
      return next;
    });
  }

  // ── duplicate ─────────────────────────────────────────────────────────────

  function duplicateClip() {
    if (!selectedClipId) return;
    const idx = internalClips.findIndex((c) => c.id === selectedClipId);
    if (idx < 0) return;
    const src = internalClips[idx]!;
    const copy: InternalClip = { ...src, id: `${src.sourceId}-d${Date.now()}` };
    const raw = getRawDuration(src.id);
    if (raw > 0) setClipMeta((prev) => new Map(prev).set(copy.id, raw));
    setInternalClips((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      reportOrder(next);
      return next;
    });
    onSelectClip(copy.id);
  }

  // ── ruler ─────────────────────────────────────────────────────────────────

  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const totalTicks = totalDuration > 0 ? Math.ceil(totalDuration / tickInterval) + 2 : 20;
  const timelineContentWidth = Math.max(totalDuration * pxPerSec + 96, 600);

  // ── tab config ────────────────────────────────────────────────────────────

  const TABS: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
    { id: "speed", label: "Speed", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg> },
    { id: "volume", label: "Volume", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg> },
    { id: "text", label: "Text", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg> },
    { id: "audio", label: "Audio", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" /></svg> },
    { id: "effects", label: "Effects", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg> },
    { id: "export", label: "Export", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> },
  ];

  const currentSpeed = selectedClipId ? (clipSpeeds.get(selectedClipId) ?? 1) : 1;
  const currentVolume = selectedClipId ? (clipVolumes.get(selectedClipId) ?? 1) : 1;
  const rawDuration = selectedClipId ? getRawDuration(selectedClipId) : 0;
  const selectedSpeedMode: SpeedMode = selectedClipId ? (clipSpeedModes.get(selectedClipId) ?? "normal") : "normal";
  const activeCurvePreset = selectedClipId ? (clipCurvePresets.get(selectedClipId) ?? "none") : "none";
  const activeCurvePoints: CurvePoint[] = selectedClipId
    ? (clipCurvePoints.get(selectedClipId) ?? CURVE_PRESETS[0].points)
    : CURVE_PRESETS[0].points;
  const curveDuration = selectedSpeedMode === "curve" ? computeCurveDuration(activeCurvePoints, rawDuration) : rawDuration / currentSpeed;
  const curveSvgPath = buildCurveSvgPath(activeCurvePoints, GRAPH_VW, GRAPH_VH, GP_L, GP_R, GP_T, GP_B);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f11] overflow-hidden">
      {/* Hidden metadata loaders */}
      {internalClips.filter((c) => !clipMeta.has(c.id)).map((c) => (
        <video
          key={c.id}
          src={c.videoUrl}
          className="hidden"
          preload="metadata"
          onLoadedMetadata={(e) => {
            const dur = (e.target as HTMLVideoElement).duration;
            setClipMeta((prev) => new Map(prev).set(c.id, isFinite(dur) ? dur : 0));
          }}
        />
      ))}

      {/* ── Tool Tab Bar ── */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/8 bg-[#16161a] shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ${
              activeTab === tab.id
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* ── Tool Context Bar ── */}
      <div className={`shrink-0 border-b border-white/8 bg-[#13131a] ${activeTab === "speed" ? "" : "px-4 py-2.5 flex items-center gap-3 min-h-[52px] flex-wrap"}`}>

        {/* ── SPEED TAB ── */}
        {activeTab === "speed" && (
          <div className="flex flex-col px-4 pt-3 pb-3 gap-3 select-none">
            {/* Normal / Curve toggle */}
            <div className="flex gap-0 bg-white/6 rounded-lg p-0.5 w-48 shrink-0">
              {(["normal", "curve"] as SpeedMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setSpeedMode(m)}
                  disabled={!selectedClipId}
                  className={`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all disabled:opacity-40 ${
                    selectedSpeedMode === m ? "bg-white/90 text-black shadow" : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* ── Normal mode ── */}
            {selectedSpeedMode === "normal" && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-white/80">Basic</span>
                  <button
                    onClick={() => { setSpeed(1); }}
                    disabled={!selectedClipId}
                    title="Reset speed"
                    className="text-gray-600 hover:text-gray-400 transition-colors disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 mb-2 block">Speed</span>
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={0.1} max={8} step={0.05}
                      value={currentSpeed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                      disabled={!selectedClipId}
                      className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                    />
                    <span className="text-xs font-mono bg-white/8 text-white rounded-lg px-3 py-1.5 w-14 text-center shrink-0">
                      {currentSpeed % 1 === 0 ? `${currentSpeed}x` : `${currentSpeed.toFixed(1)}x`}
                    </span>
                  </div>
                </div>
                {rawDuration > 0 && (
                  <div>
                    <span className="text-[11px] text-gray-500 mb-1.5 block">Duration</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 font-mono">{rawDuration.toFixed(1)}s</span>
                      <div className="flex-1 flex items-center gap-px">
                        {Array.from({ length: 20 }, (_, i) => (
                          <div key={i} className={`flex-1 rounded-full ${i < Math.round(20 * Math.min(currentSpeed, 1)) ? "bg-white/25 h-[5px]" : "bg-white/10 h-[3px]"}`} />
                        ))}
                        <div className="w-0 h-0 border-t-[4px] border-b-[4px] border-l-[5px] border-t-transparent border-b-transparent border-l-white/30 ml-0.5" />
                      </div>
                      <span className="text-xs font-mono bg-white/8 text-white rounded-lg px-3 py-1.5 w-14 text-center shrink-0">
                        {curveDuration.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                )}
                {!selectedClipId && <span className="text-xs text-gray-600">Select a clip to adjust speed</span>}
              </div>
            )}

            {/* ── Curve mode ── */}
            {selectedSpeedMode === "curve" && (
              <div className="flex flex-col gap-3">
                {/* Preset grid */}
                <div className="grid grid-cols-4 gap-1.5">
                  {CURVE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => selectCurvePreset(preset.id)}
                      disabled={!selectedClipId}
                      className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all disabled:opacity-30 ${
                        activeCurvePreset === preset.id
                          ? "border-sky-400 bg-sky-400/10"
                          : "border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/20"
                      }`}
                    >
                      {preset.id === "custom" ? (
                        <svg className="w-8 h-5" fill="none" viewBox="0 0 60 40" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" d="M 10 14 H 50 M 10 20 H 50 M 10 26 H 50" />
                          <circle cx="22" cy="14" r="4" fill="currentColor" stroke="none" />
                          <circle cx="38" cy="26" r="4" fill="currentColor" stroke="none" />
                        </svg>
                      ) : (
                        <svg className="w-8 h-5" viewBox="0 0 60 40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="30" x2="55" y2="30" stroke="currentColor" strokeWidth={0.5} strokeOpacity={0.3} />
                          <line x1="5" y1="20" x2="55" y2="20" stroke="currentColor" strokeWidth={0.5} strokeOpacity={0.15} />
                          <path d={preset.icon} />
                        </svg>
                      )}
                      <span className="text-[9px] text-gray-400 font-medium leading-tight text-center">{preset.label}</span>
                    </button>
                  ))}
                </div>

                {/* Duration */}
                {rawDuration > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>Duration:</span>
                    <span className="font-mono">{rawDuration.toFixed(1)}s</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                    <span className="font-mono font-semibold text-white">{curveDuration.toFixed(1)}s</span>
                  </div>
                )}

                {/* Curve graph */}
                <div className="relative rounded-lg overflow-hidden bg-white/3 border border-white/8">
                  <svg
                    ref={curveGraphRef}
                    viewBox={`0 0 ${GRAPH_VW} ${GRAPH_VH}`}
                    className="w-full"
                    style={{ height: 148 }}
                    onPointerDown={(e) => e.preventDefault()}
                  >
                    {/* Grid lines */}
                    {[0, 0.5, 1].map((y) => {
                      const svgY = GRAPH_VH - GP_B - y * (GRAPH_VH - GP_T - GP_B);
                      return (
                        <g key={y}>
                          <line x1={GP_L} y1={svgY} x2={GRAPH_VW - GP_R} y2={svgY} stroke="white" strokeOpacity={y === 0.5 ? 0.12 : 0.06} strokeWidth={1} strokeDasharray={y === 0.5 ? "none" : "3 4"} />
                          <text x={GP_L - 5} y={svgY + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="monospace">
                            {y === 0 ? "0.1x" : y === 0.5 ? "1x" : "10x"}
                          </text>
                        </g>
                      );
                    })}
                    {/* Curve path */}
                    {activeCurvePoints.length >= 2 && (
                      <path d={curveSvgPath} fill="none" stroke="#38bdf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    )}
                    {/* Control points */}
                    {activeCurvePoints.map((pt, idx) => {
                      const cx = GP_L + pt.x * (GRAPH_VW - GP_L - GP_R);
                      const cy = GRAPH_VH - GP_B - pt.y * (GRAPH_VH - GP_T - GP_B);
                      return (
                        <circle
                          key={idx}
                          cx={cx} cy={cy} r={6}
                          fill="#0f0f11" stroke="#38bdf8" strokeWidth={2}
                          className="cursor-grab active:cursor-grabbing"
                          style={{ touchAction: "none" }}
                          onPointerDown={(e) => {
                            if (!selectedClipId || !curveGraphRef.current) return;
                            startCurvePtDrag({ idx, svgRect: curveGraphRef.current.getBoundingClientRect(), clipId: selectedClipId }, e);
                          }}
                        />
                      );
                    })}
                  </svg>
                </div>

                {/* Bottom actions */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => { if (selectedClipId) { selectCurvePreset("none"); } }}
                    disabled={!selectedClipId}
                    title="Reset curve"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedClipId) return;
                      const flat = activeCurvePoints.map((p) => ({ ...p, y: 0.5 }));
                      setClipCurvePoints((prev) => new Map(prev).set(selectedClipId, flat));
                      setClipCurvePresets((prev) => new Map(prev).set(selectedClipId, "custom"));
                    }}
                    disabled={!selectedClipId}
                    title="Flatten curve"
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>
                  </button>
                </div>

                {!selectedClipId && <span className="text-xs text-gray-600">Select a clip to edit the speed curve</span>}
              </div>
            )}
          </div>
        )}

        {/* ── VOLUME TAB ── */}
        {activeTab === "volume" && (
          <>
            <span className="text-xs text-gray-500 mr-1">Volume</span>
            <input
              type="range" min={0} max={1} step={0.01}
              value={currentVolume}
              onChange={(e) => setVolume(Number(e.target.value))}
              disabled={!selectedClipId}
              className="w-32 accent-violet-500 disabled:opacity-30"
            />
            <span className="text-xs font-mono text-gray-400">{Math.round(currentVolume * 100)}%</span>
            {!selectedClipId && <span className="text-xs text-gray-600 ml-2">Select a clip to adjust volume</span>}
          </>
        )}

        {(activeTab === "text" || activeTab === "audio" || activeTab === "effects") && (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs text-gray-600">
              {activeTab === "text" ? "Text overlays" : activeTab === "audio" ? "Audio mixing" : "Visual effects"} — coming soon
            </span>
          </div>
        )}

        {activeTab === "export" && (
          <div className="flex items-center gap-3 flex-wrap">
            {internalClips.length === 0 ? (
              <span className="text-xs text-gray-600">No clips to export yet</span>
            ) : (
              <>
                <span className="text-xs text-gray-500">Download clips:</span>
                {internalClips.map((clip, i) => (
                  <a
                    key={clip.id}
                    href={clip.videoUrl}
                    download={`shot-${i + 1}.mp4`}
                    className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-400/40 rounded px-2 py-1 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Shot {i + 1}{clip.reversed ? " (REV)" : ""}
                  </a>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Video Preview ── */}
      <div className="flex-1 bg-black flex items-center justify-center min-h-0 relative" onClick={() => onSelectClip(null)}>
        {internalClips.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.5 2.625c.621 0 1.125.504 1.125 1.125v1.5m-7.5-6v5.625m0 0c0 .621.504 1.125 1.125 1.125h.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125h-.75A1.125 1.125 0 0010.5 9.375v.75" />
              </svg>
            </div>
            <p className="text-sm text-gray-400 font-medium">No clips yet</p>
            <p className="text-xs text-gray-600 max-w-xs">
              Chat with the AI showrunner to generate shots — they&apos;ll appear here in the timeline
            </p>
          </div>
        ) : (
          <div className="relative w-full h-full">
            {([0, 1] as const).map((slot) => {
              const isActive = activeSlot === slot;
              return (
                <div
                  key={slot}
                  className="absolute inset-0 flex items-center justify-center p-4"
                  style={{ zIndex: isActive ? 1 : 0, visibility: isActive ? "visible" : "hidden" }}
                >
                  <video
                    ref={videoRefs[slot]}
                    className="max-w-full max-h-full rounded-lg shadow-2xl"
                    onTimeUpdate={isActive ? handleTimeUpdate : undefined}
                    onEnded={isActive ? handleEnded : undefined}
                    onPlay={isActive ? () => setIsPlaying(true) : undefined}
                    onPause={isActive ? (e) => { if (!(e.target as HTMLVideoElement).ended) setIsPlaying(false); } : undefined}
                    playsInline
                  />
                </div>
              );
            })}

            {/* Reversed overlay indicator */}
            {internalClips[activeClipIndex]?.reversed && (
              <div className="absolute top-3 left-3 bg-amber-600/80 backdrop-blur-sm rounded-md px-2 py-1">
                <span className="text-[10px] font-bold text-white">REVERSED (export)</span>
              </div>
            )}
          </div>
        )}

        {internalClips.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
            <span className="text-xs font-mono text-white/70">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        )}
      </div>

      {/* ── Transport Controls ── */}
      <div className="shrink-0 h-11 flex items-center justify-between px-4 border-t border-white/6 bg-black">
        {/* Left: edit actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={deleteClip}
            disabled={!selectedClipId}
            title="Delete clip"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
          <button
            onClick={splitAtPlayhead}
            disabled={!canSplit}
            title="Split at playhead"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.839c.005-.351.054-.695.14-1.024m0 0 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" />
            </svg>
          </button>
          <button
            onClick={duplicateClip}
            disabled={!selectedClipId}
            title="Duplicate clip"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
          </button>
          <button
            onClick={toggleReverse}
            disabled={!selectedClipId}
            title="Reverse clip"
            className={`w-8 h-8 flex items-center justify-center rounded transition-all disabled:opacity-25 disabled:cursor-not-allowed ${
              selectedClip?.reversed ? "text-amber-400 bg-amber-500/15 hover:bg-amber-500/25" : "text-gray-500 hover:text-white hover:bg-white/10"
            }`}
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
        </div>

        {/* Center: transport */}
        <div className="flex items-center gap-1">
          <button
            onClick={prevClip}
            disabled={internalClips.length === 0}
            title="Previous clip"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm12 12L8 12l10-6z" />
            </svg>
          </button>
          <button
            onClick={togglePlay}
            disabled={internalClips.length === 0}
            title={isPlaying ? "Pause" : "Play"}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-black hover:bg-white transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            {isPlaying
              ? <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              : <svg className="w-[15px] h-[15px] ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            }
          </button>
          <button
            onClick={nextClip}
            disabled={internalClips.length === 0}
            title="Next clip"
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l10-6L6 6v12zm12-12v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Right: zoom */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPxPerSec((p) => Math.max(20, Math.round(p * 0.8)))}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white transition-all"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6" />
            </svg>
          </button>
          <input
            type="range"
            min={20}
            max={300}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-24 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/70 hover:[&::-webkit-slider-thumb]:bg-white"
          />
          <button
            onClick={() => setPxPerSec((p) => Math.min(300, Math.round(p * 1.25)))}
            className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-white transition-all"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="shrink-0 border-t border-white/8 bg-[#0d0d10] flex flex-col" style={{ height: TIMELINE_H }}>
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onClick={handleTimelineClick}
          onWheel={handleTimelineWheel}
          style={{ scrollbarWidth: "thin", scrollbarColor: "#222 transparent" }}
        >
          <div className="relative" style={{ width: timelineContentWidth, minWidth: "100%", height: "100%" }}>

            {/* ── Playhead (full height, above everything) ── */}
            <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: LABEL_W + displayTime * pxPerSec }}>
              <div
                onPointerDown={(e) => startPlayheadDrag({ startX: e.clientX, startTime: displayTime }, e)}
                className="absolute top-0 left-1/2 -translate-x-1/2 cursor-ew-resize select-none pointer-events-auto"
                style={{ touchAction: "none" }}
              >
                <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[9px] border-l-transparent border-r-transparent border-t-violet-400 hover:border-t-violet-300 transition-colors" />
                <div className="absolute -inset-2" />
              </div>
              <div className="absolute top-[9px] bottom-0 w-[2px] bg-violet-400/80 -translate-x-px" />
            </div>

            {/* ── Ruler ── */}
            <div className="absolute top-0 left-0 right-0 bg-[#111115] border-b border-white/8" style={{ height: RULER_H }}>
              {/* Label corner */}
              <div className="absolute left-0 top-0 bottom-0 bg-[#0d0d10] border-r border-white/8 flex items-center justify-center" style={{ width: LABEL_W }}>
                <span className="text-[9px] text-gray-700 font-mono select-none">TIME</span>
              </div>
              {/* Ticks */}
              <div className="absolute top-0 bottom-0" style={{ left: LABEL_W }}>
                {Array.from({ length: totalTicks }, (_, i) => {
                  const t = i * tickInterval;
                  const x = t * pxPerSec;
                  const isMajor = t % (tickInterval * 2) === 0;
                  return (
                    <div key={t} className="absolute bottom-0 flex flex-col-reverse items-start" style={{ left: x }}>
                      <div className={`w-px ${isMajor ? "bg-white/25" : "bg-white/10"}`} style={{ height: isMajor ? 10 : 5 }} />
                      {isMajor && (
                        <span className="text-[9px] text-gray-600 ml-1 select-none mb-1 font-mono">{formatTime(t)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── VIDEO track ── */}
            <div className="absolute left-0 right-0 flex border-b border-white/6" style={{ top: RULER_H, height: VIDEO_TRACK_H }}>
              {/* Label */}
              <div className="shrink-0 flex flex-col items-center justify-center gap-1 border-r border-white/8 bg-[#0d0d10]" style={{ width: LABEL_W }}>
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <span className="text-[8px] text-gray-600 font-semibold uppercase tracking-wider">Video</span>
              </div>
              {/* Clip area — absolute positioning */}
              <div className="relative flex-1 overflow-visible">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={internalClips.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                    {internalClips.map((clip, i) => (
                      <SortableClipBlock
                        key={clip.id}
                        clip={clip}
                        index={i}
                        clipLeft={(clipOffsets[i] ?? 0) * pxPerSec}
                        width={getEffectiveDuration(clip) * pxPerSec}
                        isSelected={clip.id === selectedClipId}
                        isActive={i === activeClipIndex}
                        duration={getEffectiveDuration(clip)}
                        rawDuration={getRawDuration(clip.id)}
                        onClick={() => onSelectClip(clip.id)}
                        onTrimHandlePointerDown={(e, edge) => handleTrimHandlePointerDown(e, clip, edge)}
                      />
                    ))}
                    {internalClips.length === 0 && (
                      <div className="absolute inset-2 rounded border border-dashed border-white/8 flex items-center justify-center">
                        <span className="text-[10px] text-gray-700">Generate shots to start editing</span>
                      </div>
                    )}
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            {/* ── AUDIO track ── */}
            <div className="absolute left-0 right-0 flex border-b border-white/6" style={{ top: RULER_H + VIDEO_TRACK_H, height: AUDIO_TRACK_H }}>
              <div className="shrink-0 flex flex-col items-center justify-center gap-1 border-r border-white/8 bg-[#0d0d10]" style={{ width: LABEL_W }}>
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
                <span className="text-[8px] text-gray-600 font-semibold uppercase tracking-wider">Audio</span>
              </div>
              <div className="relative flex-1">
                {internalClips.map((clip, i) => {
                  const w = Math.max(getEffectiveDuration(clip) * pxPerSec - 2, 20);
                  const left = (clipOffsets[i] ?? 0) * pxPerSec;
                  return (
                    <div
                      key={clip.id}
                      className={`absolute top-2 bottom-2 rounded overflow-hidden transition-opacity ${i === activeClipIndex ? "opacity-100" : "opacity-40"}`}
                      style={{ left, width: w }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/70 via-violet-800/60 to-indigo-900/70" />
                      <div className="absolute inset-x-0 inset-y-1.5 flex items-center gap-px px-1">
                        {Array.from({ length: Math.max(Math.floor(w / 3), 4) }, (_, j) => {
                          const h = 20 + Math.sin(j * 0.9 + i * 2.1) * 16 + Math.sin(j * 1.8 + 0.5) * 10;
                          return <div key={j} className="flex-1 bg-indigo-400/60 rounded-full" style={{ height: `${Math.max(h, 8)}%` }} />;
                        })}
                      </div>
                    </div>
                  );
                })}
                {internalClips.length === 0 && (
                  <div className="absolute inset-2 rounded border border-dashed border-white/6" />
                )}
              </div>
            </div>

            {/* ── TEXT / EFFECTS track (placeholder) ── */}
            <div className="absolute left-0 right-0 flex" style={{ top: RULER_H + VIDEO_TRACK_H + AUDIO_TRACK_H, height: TEXT_TRACK_H }}>
              <div className="shrink-0 flex flex-col items-center justify-center gap-0.5 border-r border-white/8 bg-[#0d0d10]" style={{ width: LABEL_W }}>
                <svg className="w-3.5 h-3.5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                <span className="text-[7px] text-gray-700 font-semibold uppercase tracking-wider">Text</span>
              </div>
              <div className="relative flex-1 flex items-center">
                <span className="text-[9px] text-gray-800 ml-3 select-none italic">Text overlays — coming soon</span>
              </div>
            </div>

          </div>
        </div>

        {/* Timeline footer */}
        <div className="h-7 shrink-0 border-t border-white/8 flex items-center px-3 gap-4">
          <span className="text-[10px] text-gray-700">
            {internalClips.length} {internalClips.length === 1 ? "clip" : "clips"}
            {totalDuration > 0 && ` · ${formatTime(totalDuration)} total`}
          </span>
          {selectedClip && (
            <span className="text-[10px] text-violet-500">
              Selected: Shot {internalClips.findIndex((c) => c.id === selectedClipId) + 1}
              {selectedClip.approved && " · Approved"}
              {selectedClip.reversed && " · Reversed"}
              {(selectedClip.trimStart > 0 || selectedClip.trimEnd !== null) && " · Trimmed"}
            </span>
          )}
        </div>
      </div>

      {/* Trim drag tooltip */}
      {trimTooltip && (
        <div
          className="fixed z-50 bg-gray-900/95 text-violet-300 text-xs font-mono px-2 py-1 rounded shadow-xl border border-white/10 pointer-events-none -translate-x-1/2"
          style={{ left: trimTooltip.x, top: trimTooltip.y - 32 }}
        >
          {trimTooltip.time.toFixed(2)}s
        </div>
      )}
    </div>
  );
}
