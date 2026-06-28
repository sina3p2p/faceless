"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Player, type PlayerRef } from "@remotion/player";
import { StoryComposition, type StoryCompositionProps, type AudioClipConfig, computeSequenceLayout, FPS } from "@/remotion/StoryComposition";
import { FloatingPanel } from "./floating-panel";
import { MediaPickerDialog, type MediaItem as LibraryMediaItem } from "@/components/ui/media-picker-dialog";

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
  startTime: number;   // absolute position on timeline (seconds)
  trackIndex: number;  // which row (0 = top/primary)
  trimStart: number;
  trimEnd: number | null;
  reversed: boolean;
};

type AudioClip = {
  id: string;
  url: string;
  name: string;
  startTime: number;
  trackIndex: number;
  trimStart: number;
  trimEnd: number | null;
  rawDuration: number;
  volume: number;
};

type ToolTab = "speed" | "volume" | "text" | "audio" | "effects" | "export" | "ai-edit";
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
      const y = 0.5 * ((2 * a.y) + (-p0.y + b.y) * u + (2 * p0.y - 5 * a.y + 4 * b.y - p3.y) * u * u + (-p0.y + 3 * a.y - 3 * b.y + p3.y) * u * u * u);
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
    const p0 = ext[i - 1], p1 = ext[i], p2 = ext[i + 1], p3 = ext[i + 2];
    d += ` C ${mx(p1.x + (p2.x - p0.x) / 6)} ${my(p1.y + (p2.y - p0.y) / 6)}, ${mx(p2.x - (p3.x - p1.x) / 6)} ${my(p2.y - (p3.y - p1.y) / 6)}, ${mx(p2.x)} ${my(p2.y)}`;
  }
  return d;
}

const CURVE_PRESETS: { id: string; label: string; points: CurvePoint[]; icon: string }[] = [
  { id: "none", label: "None", points: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 L 55 20" },
  { id: "montage", label: "Montage", points: [{ x: 0, y: 0.5 }, { x: 0.15, y: 0.5 }, { x: 0.32, y: 0.76 }, { x: 0.55, y: 0.24 }, { x: 0.72, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 C 11 20 15 8 25 8 C 36 8 39 32 46 32 C 51 32 52 20 55 20" },
  { id: "hero", label: "Hero", points: [{ x: 0, y: 0.5 }, { x: 0.2, y: 0.5 }, { x: 0.36, y: 0.82 }, { x: 0.62, y: 0.18 }, { x: 0.78, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 C 13 20 19 5 29 5 C 40 5 43 35 49 35 C 53 35 54 20 55 20" },
  { id: "bullet", label: "Bullet", points: [{ x: 0, y: 0.5 }, { x: 0.25, y: 0.5 }, { x: 0.5, y: 0.1 }, { x: 0.75, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 C 13 20 20 37 30 37 C 40 37 46 20 55 20" },
  { id: "jump-cut", label: "Jump Cut", points: [{ x: 0, y: 0.5 }, { x: 0.3, y: 0.5 }, { x: 0.38, y: 0.8 }, { x: 0.46, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 20 L 22 20 C 26 20 28 7 30 7 C 32 7 34 20 38 20 L 55 20" },
  { id: "flash-in", label: "Flash In", points: [{ x: 0, y: 0.5 }, { x: 0.58, y: 0.5 }, { x: 0.74, y: 0.76 }, { x: 1, y: 0.76 }], icon: "M 5 20 L 34 20 C 43 20 48 8 55 8" },
  { id: "flash-out", label: "Flash Out", points: [{ x: 0, y: 0.76 }, { x: 0.26, y: 0.76 }, { x: 0.42, y: 0.5 }, { x: 1, y: 0.5 }], icon: "M 5 8 C 12 8 17 20 26 20 L 55 20" },
  { id: "custom", label: "Custom", points: [], icon: "" },
];

interface VideoEditorPanelProps {
  clips: Clip[];
  sessionId: string;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function linearToDb(vol: number): number {
  return vol > 0 ? 20 * Math.log10(vol) : -Infinity;
}
function dbToLinear(db: number): number {
  return db <= -60 ? 0 : Math.pow(10, db / 20);
}
function formatDb(db: number): string {
  if (!isFinite(db) || db <= -60) return "-∞";
  return `${db >= 0 ? "+" : ""}${db.toFixed(0)}dB`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function toInternalClip(c: Clip, startTime = 0, trackIndex = 0): InternalClip {
  return { id: c.toolCallId, sourceId: c.toolCallId, videoUrl: c.videoUrl, approved: c.approved, startTime, trackIndex, trimStart: 0, trimEnd: null, reversed: false };
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
      className={`absolute top-0 bottom-0 w-3 z-10 flex items-center justify-center cursor-ew-resize group/h pointer-events-auto ${edge === "start" ? "left-0" : "right-0"
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

// Layout constants
const RULER_H = 28;
const CLIP_TRACK_H = 68;
const FOOTER_H = 28;
const LABEL_W = 68;
const MAX_TRACKS = 8;

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function VideoEditorPanel({ clips, sessionId, selectedClipId, onSelectClip }: VideoEditorPanelProps) {
  const [internalClips, setInternalClips] = useState<InternalClip[]>(() => {
    // Space clips sequentially on track 0 with a 5s placeholder gap.
    // Real durations load asynchronously via onLoadedMetadata.
    let cursor = 0;
    return clips.map((c) => {
      const clip = toInternalClip(c, cursor, 0);
      cursor += 5;
      return clip;
    });
  });
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
  const [clipFadeIns, setClipFadeIns] = useState<Map<string, number>>(new Map());
  const [clipFadeOuts, setClipFadeOuts] = useState<Map<string, number>>(new Map());

  // Transitions between clips
  type TransitionType = "cut" | "dissolve" | "fade-black" | "slide-left" | "slide-right" | "slide-up" | "slide-down" | "zoom-in" | "wipe-left" | "wipe-right";
  interface TransitionSetting { type: TransitionType; duration: number; }
  const [clipTransitions, setClipTransitions] = useState<Map<string, TransitionSetting>>(new Map());
  const [transitionPickerFor, setTransitionPickerFor] = useState<string | null>(null);

  // ── AI Edit ───────────────────────────────────────────────────────────────
  const [aiEditPrompt, setAiEditPrompt] = useState("");
  const [aiEditLoading, setAiEditLoading] = useState(false);
  const [aiEditError, setAiEditError] = useState<string | null>(null);

  // ── Audio clips ───────────────────────────────────────────────────────────
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);

  // ── Media pickers ──────────────────────────────────────────────────────
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);

  const audioDragRef = useRef<{ id: string; startX: number; startY: number; originStart: number; originTrack: number } | null>(null);
  const audioTrimDragRef = useRef<{ id: string; edge: "start" | "end"; startX: number; initialValue: number; rawDuration: number; otherEdge: number } | null>(null);

  const getAudioEffDur = useCallback((ac: AudioClip) => {
    if (!ac.rawDuration) return 0;
    const end = ac.trimEnd ?? ac.rawDuration;
    return Math.max(0, end - ac.trimStart);
  }, []);

  function addVideoToTimeline(videoUrl: string, id?: string) {
    const clipId = id ?? `user-${Date.now()}`;
    const lastEnd = Math.max(0, ...internalClipsRef.current.filter((c) => c.trackIndex === 0).map((c) => c.startTime + (clipMetaRef.current.get(c.id) ?? 5)));
    setInternalClips((prev) => [...prev, { id: clipId, sourceId: clipId, videoUrl, startTime: lastEnd, trackIndex: 0, trimStart: 0, trimEnd: null, reversed: false }]);
    onSelectClip(clipId);
  }

  function handleVideoSelect(item: LibraryMediaItem) {
    addVideoToTimeline(item.url, item.id);
  }

  function handleAudioSelect(item: LibraryMediaItem) {
    const el = new window.Audio();
    el.src = item.url;
    el.addEventListener("loadedmetadata", () => {
      const dur = isFinite(el.duration) ? el.duration : 0;
      const id = `audio-${Date.now()}`;
      setAudioClips((prev) => {
        const usedTracks = new Set([
          ...internalClipsRef.current.map((c) => c.trackIndex),
          ...prev.map((ac) => ac.trackIndex),
        ]);
        let trackIndex = 0;
        while (usedTracks.has(trackIndex)) trackIndex++;
        return [...prev, { id, url: item.url, name: item.prompt ?? "audio", startTime: 0, trackIndex, trimStart: 0, trimEnd: null, rawDuration: dur, volume: 1 }];
      });
      setSelectedAudioId(id);
    }, { once: true });
  }

  // Floating settings popup
  const [popupOpen, setPopupOpen] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // Remotion Player ref
  const playerRef = useRef<PlayerRef>(null);

  const timelineRef = useRef<HTMLDivElement>(null);

  // Always-fresh refs for closures
  const internalClipsRef = useRef(internalClips);
  internalClipsRef.current = internalClips;
  const clipMetaRef = useRef(clipMeta);
  clipMetaRef.current = clipMeta;

  // Refs that need to stay current inside stable usePointerDrag closures
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;
  const totalDurationRef = useRef(0); // updated after totalDuration is computed
  const seekToRef = useRef<(t: number) => void>(() => { }); // updated after seekTo is defined
  const pendingScrollRef = useRef<number | null>(null);

  // Trim drag tooltip
  const [trimTooltip, setTrimTooltip] = useState<{ x: number; y: number; time: number } | null>(null);

  // Playhead local state — tracks position during drag for instant visual feedback
  const [localPlayheadTime, setLocalPlayheadTime] = useState<number | null>(null);
  const displayTime = localPlayheadTime ?? currentTime;

  // Blue hover cursor
  const [hoverTime, setHoverTime] = useState<number | null>(null);

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
      const incoming = clips.filter((c) => !existingSourceIds.has(c.toolCallId));
      if (incoming.length === 0) return updated;

      // Place new clips sequentially at the end of track 0
      let cursor = Math.max(
        0,
        ...updated.filter((c) => c.trackIndex === 0).map((c) => c.startTime + (clipMeta.get(c.id) ?? 5))
      );
      const newClips = incoming.map((c) => {
        const clip = toInternalClip(c, cursor, 0);
        cursor += clipMeta.get(c.toolCallId) ?? 5;
        return clip;
      });
      return [...updated, ...newClips];
    });
  }, [clips]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived ───────────────────────────────────────────────────────────────

  const getRawDuration = useCallback((id: string) => clipMeta.get(id) ?? 0, [clipMeta]);

  const getEffectiveDuration = useCallback((clip: InternalClip) => {
    const raw = getRawDuration(clip.id);
    if (!raw) return 0;
    const end = clip.trimEnd ?? raw;
    return Math.max(0, end - clip.trimStart);
  }, [getRawDuration]);

  const totalDuration = useMemo(
    () => Math.max(
      0,
      ...internalClips.map((c) => c.startTime + getEffectiveDuration(c)),
      ...audioClips.map((ac) => ac.startTime + getAudioEffDur(ac)),
    ),
    [internalClips, getEffectiveDuration, audioClips, getAudioEffDur]
  );
  totalDurationRef.current = totalDuration;

  // ── auto-remove transitions when clips are no longer adjacent ─────────────

  useEffect(() => {
    setClipTransitions((prev) => {
      if (prev.size === 0) return prev;
      const SNAP = 0;
      let changed = false;
      const next = new Map(prev);
      for (const clipId of next.keys()) {
        const clipB = internalClips.find((c) => c.id === clipId);
        if (!clipB) { next.delete(clipId); changed = true; continue; }
        const adjacent = internalClips.some(
          (clipA) =>
            clipA.id !== clipB.id &&
            clipA.trackIndex === clipB.trackIndex &&
            Math.abs((clipA.startTime + getEffectiveDuration(clipA)) - clipB.startTime) <= SNAP,
        );
        if (!adjacent) { next.delete(clipId); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [internalClips, getEffectiveDuration]);

  // ── Remotion composition props ────────────────────────────────────────────

  const compositionProps: StoryCompositionProps = useMemo(() => ({
    clips: internalClips.map((clip) => ({
      id: clip.id,
      videoUrl: clip.videoUrl,
      startTime: clip.startTime,
      trackIndex: clip.trackIndex,
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      rawDuration: getRawDuration(clip.id),
      speed: clipSpeeds.get(clip.id) ?? 1,
      volume: clipVolumes.get(clip.id) ?? 1,
      fadeIn: clipFadeIns.get(clip.id) ?? 0,
      fadeOut: clipFadeOuts.get(clip.id) ?? 0,
      transition: (() => {
        const t = clipTransitions.get(clip.id);
        if (!t || t.type === "cut") return undefined;
        return { type: t.type as import("@/remotion/StoryComposition").TransitionType, duration: t.duration };
      })(),
    })),
    audioClips: audioClips.map((ac): AudioClipConfig => ({
      id: ac.id,
      url: ac.url,
      startTime: ac.startTime,
      trimStart: ac.trimStart,
      trimEnd: ac.trimEnd,
      rawDuration: ac.rawDuration,
      volume: ac.volume,
    })),
  }), [internalClips, clipSpeeds, clipVolumes, clipFadeIns, clipFadeOuts, clipTransitions, clipMeta, audioClips]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalFrames = useMemo(() => {
    const { totalFrames: tf } = computeSequenceLayout(compositionProps.clips);
    const audioMax = audioClips.reduce((m, ac) => Math.max(m, Math.round((ac.startTime + getAudioEffDur(ac)) * FPS)), 0);
    return Math.max(1, tf, audioMax);
  }, [compositionProps, audioClips, getAudioEffDur]);

  // ── Player event → React state sync ──────────────────────────────────────
  // Re-runs when the Player first mounts (clips.length goes 0 → >0), so
  // the ref is guaranteed to be populated when the effect executes.

  const hasClips = internalClips.length > 0;

  useEffect(() => {
    if (!hasClips) return;
    const player = playerRef.current;
    if (!player) return;
    const onTimeUpdate = () => {
      const t = player.getCurrentFrame() / FPS;
      setCurrentTime(t);
      const clips = internalClipsRef.current;
      let idx = 0;
      let bestTrack = Infinity;
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i]!;
        const end = c.startTime + (clipMetaRef.current.get(c.id) ?? 0);
        if (t >= c.startTime && t < end && c.trackIndex < bestTrack) {
          idx = i;
          bestTrack = c.trackIndex;
        }
      }
      setActiveClipIndex(idx);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    player.addEventListener("timeupdate", onTimeUpdate);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    player.addEventListener("ended", onEnded);
    return () => {
      player.removeEventListener("timeupdate", onTimeUpdate);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
      player.removeEventListener("ended", onEnded);
    };
  }, [hasClips]);

  // ── playback ──────────────────────────────────────────────────────────────

  function togglePlay() {
    if (internalClips.length === 0) return;
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      if (currentTime >= totalDuration && totalDuration > 0) { seekTo(0); return; }
      playerRef.current?.play();
    }
  }

  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(clamped);
    playerRef.current?.seekTo(Math.round(clamped * FPS));
  }
  seekToRef.current = seekTo;

  // ── transport ─────────────────────────────────────────────────────────────

  function goToStart() { seekTo(0); }
  function goToEnd() { seekTo(totalDuration); }

  function prevClip() {
    const starts = internalClips.map((c) => c.startTime).sort((a, b) => a - b);
    const before = starts.filter((t) => t < currentTime - 0.05);
    seekTo(before.length > 0 ? before[before.length - 1]! : 0);
  }

  function nextClip() {
    const starts = internalClips.map((c) => c.startTime).sort((a, b) => a - b);
    const after = starts.find((t) => t > currentTime + 0.05);
    if (after !== undefined) seekTo(after);
  }

  // ── export ────────────────────────────────────────────────────────────────

  async function exportVideo() {
    setIsExporting(true);
    setExportProgress(0);
    try {
      // Start Lambda render
      const startRes = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compositionProps),
      });
      if (!startRes.ok) throw new Error(await startRes.text());
      const { renderId, bucketName } = (await startRes.json()) as { renderId: string; bucketName: string };

      // Poll until done
      while (true) {
        await new Promise((r) => setTimeout(r, 3000));
        const statusRes = await fetch(`/api/render?renderId=${renderId}&bucketName=${encodeURIComponent(bucketName)}`);
        if (!statusRes.ok) throw new Error(await statusRes.text());
        const status = (await statusRes.json()) as {
          done: boolean;
          progress: number;
          outputFile: string | null;
          fatalError: boolean;
          errors: { message: string }[];
        };

        setExportProgress(status.progress);

        if (status.fatalError || status.errors?.length) {
          throw new Error(status.errors?.[0]?.message ?? "Render failed");
        }
        if (status.done && status.outputFile) {
          window.open(status.outputFile, "_blank");
          break;
        }
      }
    } catch (e) {
      alert("Export failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }

  // ── timeline click ────────────────────────────────────────────────────────

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    setTransitionPickerFor(null);
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    seekTo((x - LABEL_W) / pxPerSec);
  }

  // ── free clip drag (pointer-capture based for reliable cross-row dragging) ──

  type ClipDragState = {
    clipId: string;
    startX: number;
    startY: number;
    originStartTime: number;
    originTrackIndex: number;
  };

  const clipDragRef = useRef<ClipDragState | null>(null);

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
    () => {
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
      seekToRef.current(t);
    },
    () => {
      setLocalPlayheadTime(null);
    },
  );

  // Keep a ref to localPlayheadTime so the onEnd closure above can read it
  const localPlayheadTimeRef = useRef<number | null>(null);
  localPlayheadTimeRef.current = localPlayheadTime;

  const videoPreviewRef = useRef<HTMLDivElement>(null);

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
  }

  function setVolume(vol: number) {
    if (!selectedClipId) return;
    setClipVolumes((prev) => new Map(prev).set(selectedClipId, vol));
  }

  function setFadeIn(sec: number) {
    if (!selectedClipId) return;
    setClipFadeIns((prev) => new Map(prev).set(selectedClipId, sec));
  }

  function setFadeOut(sec: number) {
    if (!selectedClipId) return;
    setClipFadeOuts((prev) => new Map(prev).set(selectedClipId, sec));
  }

  function resetVolumeSettings() {
    if (!selectedClipId) return;
    setClipVolumes((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
    setClipFadeIns((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
    setClipFadeOuts((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
  }

  function setSpeedMode(mode: SpeedMode) {
    if (!selectedClipId) return;
    setClipSpeedModes((prev) => new Map(prev).set(selectedClipId, mode));
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
    const clip = internalClips.find((c) => c.id === selectedClipId);
    if (!clip) return false;
    const localEffTime = currentTime - clip.startTime;
    const eff = getEffectiveDuration(clip);
    return localEffTime > 0.1 && localEffTime < eff - 0.1;
  }, [selectedClipId, internalClips, currentTime, getEffectiveDuration]);

  function splitAtPlayhead() {
    if (!selectedClipId || !canSplit) return;
    const clipIdx = internalClips.findIndex((c) => c.id === selectedClipId);
    if (clipIdx < 0) return;
    const clip = internalClips[clipIdx]!;
    const localEffTime = currentTime - clip.startTime;
    const rawSplitPoint = clip.trimStart + localEffTime;
    const raw = getRawDuration(clip.id);
    const splitDur = getEffectiveDuration({ ...clip, trimEnd: rawSplitPoint });

    const part1: InternalClip = { ...clip, trimEnd: rawSplitPoint };
    const part2: InternalClip = {
      ...clip,
      id: `${clip.sourceId}-s${Date.now()}`,
      trimStart: rawSplitPoint,
      startTime: clip.startTime + splitDur,
    };

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
    deleteClipById(selectedClipId);
  }

  function deleteClipById(id: string) {
    if (selectedClipId === id) onSelectClip(null);
    setInternalClips((prev) => prev.filter((c) => c.id !== id));
  }

  // ── duplicate ─────────────────────────────────────────────────────────────

  function duplicateClip() {
    if (!selectedClipId) return;
    const src = internalClips.find((c) => c.id === selectedClipId);
    if (!src) return;
    const dur = getEffectiveDuration(src);
    const copy: InternalClip = {
      ...src,
      id: `${src.sourceId}-d${Date.now()}`,
      startTime: src.startTime + dur,
    };
    const raw = getRawDuration(src.id);
    if (raw > 0) setClipMeta((prev) => new Map(prev).set(copy.id, raw));
    setInternalClips((prev) => [...prev, copy]);
    onSelectClip(copy.id);
  }

  // ── ruler ─────────────────────────────────────────────────────────────────

  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const totalTicks = totalDuration > 0 ? Math.ceil(totalDuration / tickInterval) + 2 : 20;
  const timelineContentWidth = Math.max(totalDuration * pxPerSec + 96, 600);

  // ── AI edit ──────────────────────────────────────────────────────────────

  async function handleAiEdit() {
    if (!selectedClipId || !aiEditPrompt.trim() || aiEditLoading) return;
    const clip = internalClips.find((c) => c.id === selectedClipId);
    if (!clip) return;
    const rawDur = getRawDuration(selectedClipId);
    setAiEditLoading(true);
    setAiEditError(null);
    try {
      const res = await fetch(`/api/v2/story/${sessionId}/edit-clip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: clip.videoUrl,
          prompt: aiEditPrompt.trim(),
          duration: rawDur > 0 ? rawDur : 5,
          aspectRatio: "16:9",
        }),
      });
      const data = await res.json() as { videoUrl?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "Edit failed");
      // Replace the clip's video URL and reset its trim/meta
      const newId = `${clip.sourceId}-edit-${Date.now()}`;
      setInternalClips((prev) =>
        prev.map((c) =>
          c.id === selectedClipId
            ? { ...c, id: newId, videoUrl: data.videoUrl!, trimStart: 0, trimEnd: null }
            : c
        )
      );
      setClipMeta((prev) => { const m = new Map(prev); m.delete(selectedClipId); return m; });
      onSelectClip(newId);
      setAiEditPrompt("");
    } catch (err) {
      setAiEditError(String(err));
    } finally {
      setAiEditLoading(false);
    }
  }

  // ── tab config ────────────────────────────────────────────────────────────

  const TABS: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
    { id: "speed", label: "Speed", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg> },
    { id: "volume", label: "Volume", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg> },
    { id: "text", label: "Text", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg> },
    { id: "audio", label: "Audio", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" /></svg> },
    { id: "effects", label: "Effects", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg> },
    { id: "export", label: "Export", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg> },
    { id: "ai-edit", label: "AI Edit", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg> },
  ];

  const currentSpeed = selectedClipId ? (clipSpeeds.get(selectedClipId) ?? 1) : 1;
  const currentVolume = selectedClipId ? (clipVolumes.get(selectedClipId) ?? 1) : 1;
  const currentVolumeDb = Math.max(-60, linearToDb(currentVolume));
  const currentFadeIn = selectedClipId ? (clipFadeIns.get(selectedClipId) ?? 0) : 0;
  const currentFadeOut = selectedClipId ? (clipFadeOuts.get(selectedClipId) ?? 0) : 0;
  const rawDuration = selectedClipId ? getRawDuration(selectedClipId) : 0;
  const selectedSpeedMode: SpeedMode = selectedClipId ? (clipSpeedModes.get(selectedClipId) ?? "normal") : "normal";
  const activeCurvePreset = selectedClipId ? (clipCurvePresets.get(selectedClipId) ?? "none") : "none";
  const activeCurvePoints: CurvePoint[] = selectedClipId
    ? (clipCurvePoints.get(selectedClipId) ?? CURVE_PRESETS[0].points)
    : CURVE_PRESETS[0].points;
  const curveDuration = selectedSpeedMode === "curve" ? computeCurveDuration(activeCurvePoints, rawDuration) : rawDuration / currentSpeed;
  const curveSvgPath = buildCurveSvgPath(activeCurvePoints, GRAPH_VW, GRAPH_VH, GP_L, GP_R, GP_T, GP_B);

  // ── timeline geometry ─────────────────────────────────────────────────────

  // Audio and video clips share the same track rows
  const numTracks = Math.min(MAX_TRACKS, Math.max(3,
    ...internalClips.map((c) => c.trackIndex + 2),
    ...audioClips.map((ac) => ac.trackIndex + 2),
  ));
  const timelineH = RULER_H + numTracks * CLIP_TRACK_H + FOOTER_H;

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      {/* Hidden preloaders — keep all clips buffered so OffthreadVideo has no seek delay at clip boundaries */}
      {internalClips.map((c) => (
        <video
          key={c.id}
          src={c.videoUrl}
          className="hidden"
          preload="auto"
          onLoadedMetadata={clipMeta.has(c.id) ? undefined : (e) => {
            const dur = (e.target as HTMLVideoElement).duration;
            const realDur = isFinite(dur) ? dur : 0;
            setClipMeta((prev) => new Map(prev).set(c.id, realDur));
            // Close the 5s placeholder gap: shift track-0 clips that start after
            // this one so they follow immediately after the real duration ends.
            setInternalClips((prev) => {
              const idx = prev.findIndex((x) => x.id === c.id);
              if (idx < 0) return prev;
              const clip = prev[idx]!;
              if (clip.trackIndex !== 0) return prev;
              const placeholderEnd = clip.startTime + 5;
              const realEnd = clip.startTime + realDur;
              const shift = realEnd - placeholderEnd;
              if (Math.abs(shift) < 0.01) return prev;
              return prev.map((x, xi) =>
                xi > idx && x.trackIndex === 0 && Math.abs(x.startTime - placeholderEnd) < 0.1
                  ? { ...x, startTime: Math.max(0, x.startTime + shift) }
                  : x
              );
            });
          }}
        />
      ))}

      {/* ── Tool Tab Bar ── */}
      <div className="flex items-center gap-1 px-3 h-12 border-b border-white/10 bg-black/20 backdrop-blur-md shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id && popupOpen;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (activeTab === tab.id && popupOpen) {
                  setPopupOpen(false);
                } else {
                  setActiveTab(tab.id);
                  setPopupOpen(true);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0",
                isActive
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5"
              )}
            >
              {tab.icon}{tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Video Preview ── */}
      <div ref={videoPreviewRef} className="flex-1 bg-black flex items-center justify-center min-h-0 relative overflow-hidden" onClick={() => onSelectClip(null)}>

        {/* ── Floating settings popup ── */}
        {popupOpen && (
          <FloatingPanel
            containerRef={videoPreviewRef}
            initialPos={{ x: 16, y: 16 }}
            title={activeTab}
            icon={TABS.find((t) => t.id === activeTab)?.icon}
            onClose={() => setPopupOpen(false)}
            width={300}
            zIndex={30}
          >
            <div className="max-h-[70vh] overflow-y-auto">

              {/* ── SPEED TAB ── */}
              {activeTab === "speed" && (
                <div className="flex flex-col px-4 pt-3 pb-3 gap-3 select-none">
                  <div className="flex gap-0 bg-white/6 rounded-lg p-0.5 w-48 shrink-0">
                    {(["normal", "curve"] as SpeedMode[]).map((m) => (
                      <button key={m} onClick={() => setSpeedMode(m)} disabled={!selectedClipId}
                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all disabled:opacity-40 ${selectedSpeedMode === m ? "bg-white/90 text-black shadow" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
                      >{m}</button>
                    ))}
                  </div>

                  {selectedSpeedMode === "normal" && (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/80">Basic</span>
                        <button onClick={() => setSpeed(1)} disabled={!selectedClipId} title="Reset speed" className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                      </div>
                      <div>
                        <span className="text-[11px] text-muted-foreground/60 mb-2 block">Speed</span>
                        <div className="flex items-center gap-3">
                          <input type="range" min={0.1} max={8} step={0.05} value={currentSpeed} onChange={(e) => setSpeed(Number(e.target.value))} disabled={!selectedClipId}
                            className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                          />
                          <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-14 text-center shrink-0">
                            {currentSpeed % 1 === 0 ? `${currentSpeed}x` : `${currentSpeed.toFixed(1)}x`}
                          </span>
                        </div>
                      </div>
                      {rawDuration > 0 && (
                        <div>
                          <span className="text-[11px] text-muted-foreground/60 mb-1.5 block">Duration</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{rawDuration.toFixed(1)}s</span>
                            <div className="flex-1 flex items-center gap-px">
                              {Array.from({ length: 20 }, (_, i) => (
                                <div key={i} className={`flex-1 rounded-full ${i < Math.round(20 * Math.min(currentSpeed, 1)) ? "bg-white/25 h-[5px]" : "bg-white/10 h-[3px]"}`} />
                              ))}
                              <div className="w-0 h-0 border-t-4 border-b-4 border-l-[5px] border-t-transparent border-b-transparent border-l-white/30 ml-0.5" />
                            </div>
                            <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-14 text-center shrink-0">{curveDuration.toFixed(1)}s</span>
                          </div>
                        </div>
                      )}
                      {!selectedClipId && <span className="text-xs text-muted-foreground/40">Select a clip to adjust speed</span>}
                    </div>
                  )}

                  {selectedSpeedMode === "curve" && (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-4 gap-1.5">
                        {CURVE_PRESETS.map((preset) => (
                          <button key={preset.id} onClick={() => selectCurvePreset(preset.id)} disabled={!selectedClipId}
                            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all disabled:opacity-30 ${activeCurvePreset === preset.id ? "border-sky-400 bg-sky-400/10" : "border-white/8 bg-white/4 hover:bg-white/8 hover:border-white/20"}`}
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
                            <span className="text-[9px] text-muted-foreground font-medium leading-tight text-center">{preset.label}</span>
                          </button>
                        ))}
                      </div>
                      {rawDuration > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                          <span>Duration:</span><span className="font-mono">{rawDuration.toFixed(1)}s</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></svg>
                          <span className="font-mono font-semibold text-foreground">{curveDuration.toFixed(1)}s</span>
                        </div>
                      )}
                      <div className="relative rounded-lg overflow-hidden bg-white/3 border border-white/8">
                        <svg ref={curveGraphRef} viewBox={`0 0 ${GRAPH_VW} ${GRAPH_VH}`} className="w-full" style={{ height: 140 }} onPointerDown={(e) => e.preventDefault()}>
                          {[0, 0.5, 1].map((y) => {
                            const svgY = GRAPH_VH - GP_B - y * (GRAPH_VH - GP_T - GP_B);
                            return (
                              <g key={y}>
                                <line x1={GP_L} y1={svgY} x2={GRAPH_VW - GP_R} y2={svgY} stroke="white" strokeOpacity={y === 0.5 ? 0.12 : 0.06} strokeWidth={1} strokeDasharray={y === 0.5 ? "none" : "3 4"} />
                                <text x={GP_L - 5} y={svgY + 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)" fontFamily="monospace">{y === 0 ? "0.1x" : y === 0.5 ? "1x" : "10x"}</text>
                              </g>
                            );
                          })}
                          {activeCurvePoints.length >= 2 && <path d={curveSvgPath} fill="none" stroke="currentColor" className="text-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
                          {activeCurvePoints.map((pt, idx) => {
                            const cx = GP_L + pt.x * (GRAPH_VW - GP_L - GP_R);
                            const cy = GRAPH_VH - GP_B - pt.y * (GRAPH_VH - GP_T - GP_B);
                            return (
                              <circle key={idx} cx={cx} cy={cy} r={6} fill="currentColor" className="text-background" stroke="currentColor" className="text-primary" strokeWidth={2} className="cursor-grab active:cursor-grabbing" style={{ touchAction: "none" }}
                                onPointerDown={(e) => { if (!selectedClipId || !curveGraphRef.current) return; startCurvePtDrag({ idx, svgRect: curveGraphRef.current.getBoundingClientRect(), clipId: selectedClipId }, e); }}
                              />
                            );
                          })}
                        </svg>
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => { if (selectedClipId) selectCurvePreset("none"); }} disabled={!selectedClipId} title="Reset curve" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-30">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                        <button onClick={() => { if (!selectedClipId) return; const flat = activeCurvePoints.map((p) => ({ ...p, y: 0.5 })); setClipCurvePoints((prev) => new Map(prev).set(selectedClipId, flat)); setClipCurvePresets((prev) => new Map(prev).set(selectedClipId, "custom")); }} disabled={!selectedClipId} title="Flatten curve" className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/6 text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-30">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" /></svg>
                        </button>
                      </div>
                      {!selectedClipId && <span className="text-xs text-muted-foreground/40">Select a clip to edit the speed curve</span>}
                    </div>
                  )}
                </div>
              )}

              {/* ── VOLUME TAB ── */}
              {activeTab === "volume" && (
                <div className="flex flex-col px-4 pt-3 pb-3 gap-4 select-none">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/80">Audio</span>
                    <button onClick={resetVolumeSettings} disabled={!selectedClipId} title="Reset" className="text-muted-foreground/40 hover:text-muted-foreground transition-colors disabled:opacity-30">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                    </button>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/60 mb-2 block">Volume</span>
                    <div className="flex items-center gap-3">
                      <input type="range" min={-60} max={0} step={0.5} value={currentVolumeDb} onChange={(e) => setVolume(dbToLinear(Number(e.target.value)))} disabled={!selectedClipId}
                        className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                      />
                      <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-16 text-center shrink-0">{formatDb(currentVolumeDb)}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/60 mb-2 block">Fade-in duration</span>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={5} step={0.1} value={currentFadeIn} onChange={(e) => setFadeIn(Number(e.target.value))} disabled={!selectedClipId}
                        className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                      />
                      <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-16 text-center shrink-0">{currentFadeIn.toFixed(1)}s</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] text-muted-foreground/60 mb-2 block">Fade-out duration</span>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={5} step={0.1} value={currentFadeOut} onChange={(e) => setFadeOut(Number(e.target.value))} disabled={!selectedClipId}
                        className="flex-1 h-1 appearance-none bg-white/15 rounded-full cursor-pointer disabled:opacity-30 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                      />
                      <span className="text-xs font-mono bg-white/8 text-foreground rounded-lg px-3 py-1.5 w-16 text-center shrink-0">{currentFadeOut.toFixed(1)}s</span>
                    </div>
                  </div>
                  {!selectedClipId && <span className="text-xs text-muted-foreground/40">Select a clip to adjust audio</span>}
                </div>
              )}

              {/* ── AI EDIT TAB ── */}
              {activeTab === "ai-edit" && (
                <div className="flex flex-col gap-3 px-4 py-3">
                  {!selectedClipId ? (
                    <span className="text-xs text-muted-foreground/60">Select a clip in the timeline to edit it with AI.</span>
                  ) : (
                    <>
                      <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
                        Describe the change to apply. The selected clip will be sent to Seedance and replaced with the AI-edited version.
                      </p>
                      <textarea
                        value={aiEditPrompt}
                        onChange={(e) => setAiEditPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void handleAiEdit(); } }}
                        placeholder="e.g. Change the lighting to golden hour, add slow motion to the action sequence…"
                        rows={4}
                        disabled={aiEditLoading}
                        className="w-full bg-white/6 border border-white/10 rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:border-primary/50 disabled:opacity-50"
                      />
                      {aiEditError && (
                        <p className="text-[11px] text-red-400 leading-relaxed">{aiEditError}</p>
                      )}
                      <button
                        onClick={() => { void handleAiEdit(); }}
                        disabled={!aiEditPrompt.trim() || aiEditLoading}
                        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-foreground text-xs font-semibold transition-colors"
                      >
                        {aiEditLoading ? (
                          <>
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                            </svg>
                            Editing…
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                            Edit with AI
                          </>
                        )}
                      </button>
                      <p className="text-[10px] text-muted-foreground/40">⌘↵ to submit</p>
                    </>
                  )}
                </div>
              )}

              {/* ── COMING SOON TABS ── */}
              {(activeTab === "text" || activeTab === "audio" || activeTab === "effects") && (
                <div className="flex items-center gap-2 px-4 py-4">
                  <svg className="w-4 h-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-muted-foreground/40">
                    {activeTab === "text" ? "Text overlays" : activeTab === "audio" ? "Audio mixing" : "Visual effects"} — coming soon
                  </span>
                </div>
              )}

              {/* ── EXPORT TAB ── */}
              {activeTab === "export" && (
                <div className="flex flex-col gap-2 px-4 py-3">
                  {internalClips.length === 0 ? (
                    <span className="text-xs text-muted-foreground/40">No clips to export yet</span>
                  ) : (
                    <>
                      <span className="text-[11px] text-muted-foreground/60 mb-1">Download clips</span>
                      {internalClips.map((clip, i) => (
                        <a key={clip.id} href={clip.videoUrl} download={`shot-${i + 1}.mp4`}
                          className="flex items-center gap-2 text-xs text-primary hover:text-primary border border-primary/20 hover:border-primary/40 rounded-lg px-3 py-2 transition-colors"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          </FloatingPanel>
        )}
        {internalClips.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <div className="w-16 h-16 rounded-2xl border border-white/10 bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.5 2.625c.621 0 1.125.504 1.125 1.125v1.5m-7.5-6v5.625m0 0c0 .621.504 1.125 1.125 1.125h.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125h-.75A1.125 1.125 0 0010.5 9.375v.75" />
              </svg>
            </div>
            <p className="text-sm text-muted-foreground font-medium">No clips yet</p>
            <p className="text-xs text-muted-foreground/40 max-w-xs">
              Chat with the AI showrunner to generate shots — they&apos;ll appear here in the timeline
            </p>
          </div>
        ) : (
          <Player
            ref={playerRef}
            component={StoryComposition}
            inputProps={compositionProps}
            durationInFrames={totalFrames}
            compositionWidth={1920}
            compositionHeight={1080}
            fps={FPS}
            style={{ width: "100%", height: "100%" }}
            controls={false}
            clickToPlay={false}
          />
        )}

        {internalClips.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
            <span className="text-xs font-mono text-white/70">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        )}

        {/* ── Draggable transition picker ── */}
        {transitionPickerFor !== null && (() => {
          const clip = internalClips.find((c) => c.id === transitionPickerFor);
          const trans = clip ? clipTransitions.get(clip.id) : undefined;
          if (!clip) return null;
          return (
            <FloatingPanel
              containerRef={videoPreviewRef}
              initialPos={{ x: 16, y: 60 }}
              title="Transition"
              icon={
                <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M6 1 L11 6 L6 11 L1 6 Z" />
                </svg>
              }
              onClose={() => setTransitionPickerFor(null)}
              width={280}
              zIndex={40}
            >
              <div className="px-3 py-3 flex flex-col gap-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {([
                    { type: "cut", label: "Cut", icon: "✂" },
                    { type: "dissolve", label: "Dissolve", icon: "⊕" },
                    { type: "fade-black", label: "Fade", icon: "◼" },
                    { type: "slide-left", label: "Slide ←", icon: "←" },
                    { type: "slide-right", label: "Slide →", icon: "→" },
                    { type: "slide-up", label: "Slide ↑", icon: "↑" },
                    { type: "slide-down", label: "Slide ↓", icon: "↓" },
                    { type: "zoom-in", label: "Zoom", icon: "⊙" },
                    { type: "wipe-left", label: "Wipe →", icon: "▶" },
                    { type: "wipe-right", label: "Wipe ←", icon: "◀" },
                  ] as const).map(({ type, label, icon }) => {
                    const active = (trans?.type ?? "cut") === type;
                    return (
                      <button
                        key={type}
                        onClick={() =>
                          setClipTransitions((prev) => {
                            const next = new Map(prev);
                            if (type === "cut") next.delete(clip.id);
                            else next.set(clip.id, { type, duration: trans?.duration ?? 0.5 });
                            return next;
                          })
                        }
                        className={`flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-semibold transition-all ${active
                          ? "bg-primary text-foreground shadow shadow-violet-900/50"
                          : "bg-white/6 text-muted-foreground hover:bg-white/12 hover:text-foreground"
                          }`}
                      >
                        <span className="text-base leading-none">{icon}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {trans && trans.type !== "cut" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-muted-foreground/60">Duration</span>
                      <span className="text-[11px] font-mono text-foreground">{trans.duration.toFixed(1)}s</span>
                    </div>
                    <input
                      type="range" min={0.1} max={2} step={0.1}
                      value={trans.duration}
                      onChange={(e) => {
                        const dur = Number(e.target.value);
                        setClipTransitions((prev) => new Map(prev).set(clip.id, { ...trans, duration: dur }));
                      }}
                      className="w-full h-1 appearance-none bg-white/15 rounded-full cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
                    />
                  </div>
                )}
              </div>
            </FloatingPanel>
          );
        })()}
      </div>

      {/* ── Transport Controls ── */}
      <div className="shrink-0 h-11 flex items-center justify-between px-4 border-t border-white/10 bg-black/20 backdrop-blur-md">
        {/* Left: edit actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={deleteClip}
            disabled={!selectedClipId}
            title="Delete clip"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
          <button
            onClick={splitAtPlayhead}
            disabled={!canSplit}
            title="Split at playhead"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.839c.005-.351.054-.695.14-1.024m0 0 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" />
            </svg>
          </button>
          <button
            onClick={duplicateClip}
            disabled={!selectedClipId}
            title="Duplicate clip"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
          </button>
          <button
            onClick={toggleReverse}
            disabled={!selectedClipId}
            title="Reverse clip"
            className={`w-8 h-8 flex items-center justify-center rounded transition-all disabled:opacity-25 disabled:cursor-not-allowed ${selectedClip?.reversed ? "text-amber-400 bg-amber-500/15 hover:bg-amber-500/25" : "text-muted-foreground/60 hover:text-foreground hover:bg-white/10"
              }`}
          >
            <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
            </svg>
          </button>
        </div>

        {/* Center: transport */}
        <div className="flex items-center gap-1">
          <button onClick={goToStart} disabled={internalClips.length === 0} title="Go to start"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all disabled:opacity-25 disabled:cursor-not-allowed">
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          </button>
          <button onClick={prevClip} disabled={internalClips.length === 0} title="Previous clip"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all disabled:opacity-25 disabled:cursor-not-allowed">
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm12 12L8 12l10-6z" /></svg>
          </button>
          <button onClick={togglePlay} disabled={internalClips.length === 0} title={isPlaying ? "Pause" : "Play"}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-black hover:bg-white transition-all disabled:opacity-25 disabled:cursor-not-allowed">
            {isPlaying
              ? <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              : <svg className="w-[15px] h-[15px] ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            }
          </button>
          <button onClick={nextClip} disabled={internalClips.length === 0} title="Next clip"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all disabled:opacity-25 disabled:cursor-not-allowed">
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l10-6L6 6v12zm12-12v12h2V6h-2z" /></svg>
          </button>
          <button onClick={goToEnd} disabled={internalClips.length === 0} title="Go to end"
            className="w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all disabled:opacity-25 disabled:cursor-not-allowed">
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" /></svg>
          </button>
        </div>

        {/* Right: zoom + export */}
        <div className="flex items-center gap-2">
          <button onClick={() => setPxPerSec((p) => Math.max(20, Math.round(p * 0.8)))} title="Zoom out"
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6" />
            </svg>
          </button>
          <input type="range" min={20} max={300} value={pxPerSec} onChange={(e) => setPxPerSec(Number(e.target.value))}
            className="w-20 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/70 hover:[&::-webkit-slider-thumb]:bg-white"
          />
          <button onClick={() => setPxPerSec((p) => Math.min(300, Math.round(p * 1.25)))} title="Zoom in"
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
            </svg>
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button
            onClick={() => setTimelineCollapsed((c) => !c)}
            title={timelineCollapsed ? "Expand timeline" : "Collapse timeline"}
            className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all"
          >
            <svg
              className="w-4 h-4 transition-transform duration-200"
              style={{ transform: timelineCollapsed ? "rotate(180deg)" : "rotate(0deg)" }}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div
        className="shrink-0 border-t border-white/8 bg-black/25 backdrop-blur-md flex flex-col overflow-hidden"
        style={{ height: timelineCollapsed ? 0 : timelineH, transition: "height 200ms ease" }}
      >
        {/* Scrollable track area */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onClick={handleTimelineClick}
          onWheel={handleTimelineWheel}
          onMouseMove={(e) => {
            if (!timelineRef.current) return;
            const rect = timelineRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
            setHoverTime(Math.max(0, (x - LABEL_W) / pxPerSec));
          }}
          onMouseLeave={() => setHoverTime(null)}
          style={{ scrollbarWidth: "thin", scrollbarColor: "#2a2a2a transparent" }}
        >
          <div className="relative" style={{ width: timelineContentWidth, minWidth: "100%", height: timelineH - FOOTER_H }}>

            {/* ── Hover cursor (blue) ── */}
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

            {/* ── Playhead (red) ── */}
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

            {/* ── Ruler ── */}
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

            {/* ── Track rows (background lanes) ── */}
            {Array.from({ length: numTracks }, (_, ti) => (
              <div
                key={ti}
                className="absolute left-0 right-0 border-b border-white/5"
                style={{ top: RULER_H + ti * CLIP_TRACK_H, height: CLIP_TRACK_H }}
              >
                {/* Sticky left label */}
                <div
                  className="absolute top-0 bottom-0 z-10 flex flex-col items-center justify-center border-r border-white/8 bg-black/40"
                  style={{ width: LABEL_W, position: "sticky", left: 0 }}
                >
                  <span className="text-[9px] text-muted-foreground/30 font-mono select-none">
                    {ti === 0 ? "Main" : `T${ti + 1}`}
                  </span>
                </div>
              </div>
            ))}

            {/* ── Empty state hint ── */}
            {internalClips.length === 0 && (
              <div className="absolute pointer-events-none" style={{ left: LABEL_W + 16, top: RULER_H + 24 }}>
                <span className="text-[10px] text-muted-foreground/30">Generate shots to start editing</span>
              </div>
            )}

            {/* ── Freely positioned clip blocks ── */}
            {internalClips.map((clip, i) => {
              const w = Math.max(getEffectiveDuration(clip) * pxPerSec, 24);
              const left = LABEL_W + clip.startTime * pxPerSec;
              const top = RULER_H + clip.trackIndex * CLIP_TRACK_H;
              const isSelected = clip.id === selectedClipId;
              const isActive = i === activeClipIndex;
              const raw = getRawDuration(clip.id);
              const isTrimmed = clip.trimStart > 0 || clip.trimEnd !== null;

              return (
                <div
                  key={clip.id}
                  className={`absolute rounded-lg overflow-hidden select-none border-2 transition-[border,box-shadow] cursor-grab active:cursor-grabbing ${isSelected
                    ? "border-primary ring-2 ring-primary/30 z-20"
                    : isActive
                      ? "border-primary/50 z-10"
                      : "border-white/10 hover:border-white/30 z-10"
                    }`}
                  style={{ left, top: top + 4, width: w, height: CLIP_TRACK_H - 8 }}
                  onClick={(e) => { e.stopPropagation(); onSelectClip(clip.id); }}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-trim]")) return;
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    onSelectClip(clip.id);
                    clipDragRef.current = { clipId: clip.id, startX: e.clientX, startY: e.clientY, originStartTime: clip.startTime, originTrackIndex: clip.trackIndex };
                  }}
                  onPointerMove={(e) => {
                    const d = clipDragRef.current;
                    if (!d || d.clipId !== clip.id) return;
                    const desiredStart = Math.max(0, d.originStartTime + (e.clientX - d.startX) / pxPerSecRef.current);
                    const newTrackIndex = Math.max(0, Math.min(MAX_TRACKS - 1, Math.round(d.originTrackIndex + (e.clientY - d.startY) / CLIP_TRACK_H)));
                    setInternalClips((prev) => {
                      const me = prev.find((c) => c.id === d.clipId);
                      if (!me) return prev;
                      const myDur = getEffectiveDuration(me);
                      // Resolve same-track collisions; different tracks can freely overlap
                      let resolvedStart = desiredStart;
                      if (myDur > 0) {
                        const obstacles = prev
                          .filter((c) => c.id !== d.clipId && c.trackIndex === newTrackIndex)
                          .map((c) => ({ s: c.startTime, e: c.startTime + getEffectiveDuration(c) }))
                          .filter((o) => o.e > o.s)
                          .sort((a, b) => a.s - b.s);
                        for (const o of obstacles) {
                          if (resolvedStart < o.e && resolvedStart + myDur > o.s) {
                            const snapBefore = Math.max(0, o.s - myDur);
                            const snapAfter = o.e;
                            resolvedStart = Math.abs(desiredStart - snapBefore) <= Math.abs(desiredStart - snapAfter)
                              ? snapBefore
                              : snapAfter;
                          }
                        }
                      }
                      return prev.map((c) =>
                        c.id === d.clipId ? { ...c, startTime: resolvedStart, trackIndex: newTrackIndex } : c
                      );
                    });
                  }}
                  onPointerUp={() => { clipDragRef.current = null; }}
                  onPointerCancel={() => { clipDragRef.current = null; }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 to-indigo-950/80" />

                  {/* Filmstrip */}
                  {raw > 0 ? (
                    <div className="absolute inset-0 flex overflow-hidden">
                      {Array.from({ length: FILMSTRIP_TILES }, (_, fi) => {
                        const pos = FILMSTRIP_TILES > 1 ? fi / (FILMSTRIP_TILES - 1) : 0;
                        const trimEnd = clip.trimEnd ?? raw;
                        const seekTime = clip.trimStart + pos * (trimEnd - clip.trimStart);
                        return (
                          <div key={fi} className={`relative flex-1 h-full overflow-hidden${fi < FILMSTRIP_TILES - 1 ? " border-r border-black/40" : ""}`}>
                            <video
                              src={clip.videoUrl}
                              className="absolute inset-0 w-full h-full object-cover opacity-80"
                              muted playsInline preload="metadata"
                              ref={(el) => {
                                if (!el) return;
                                const ve = el as HTMLVideoElement & { _filmseek?: number };
                                if (ve._filmseek === seekTime) return;
                                ve._filmseek = seekTime;
                                const doSeek = () => { el.currentTime = Math.max(0, Math.min(seekTime, (el.duration || raw) - 0.01)); };
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

                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                  {/* Badges */}
                  <div className="absolute top-1 right-2 flex items-center gap-1">
                    {clip.reversed && <span className="text-[8px] font-bold text-amber-400 bg-black/60 px-1 py-0.5 rounded">REV</span>}
                    {clip.approved && (
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
                        <svg className="w-2 h-2 text-foreground" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" /></svg>
                      </span>
                    )}
                  </div>

                  {getEffectiveDuration(clip) > 0 && (
                    <span className="absolute bottom-1 right-2 text-[9px] font-mono text-white/70 bg-black/50 px-1 rounded">
                      {getEffectiveDuration(clip).toFixed(1)}s
                    </span>
                  )}

                  {/* Trim accents */}
                  {isTrimmed && clip.trimStart > 0 && <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-sky-400/70" />}
                  {isTrimmed && clip.trimEnd !== null && <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-sky-400/70" />}

                  {/* Trim handles */}
                  <div className={`absolute inset-0 transition-opacity pointer-events-none ${isSelected ? "opacity-100" : "opacity-0 hover:opacity-100"}`}>
                    <TrimHandle edge="start" onPointerDown={(e) => handleTrimHandlePointerDown(e, clip, "start")} />
                    <TrimHandle edge="end" onPointerDown={(e) => handleTrimHandlePointerDown(e, clip, "end")} />
                  </div>

                  {/* Delete button */}
                  {isSelected && (
                    <button
                      data-trim
                      className="absolute top-1 left-1.5 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors z-10"
                      onClick={(e) => { e.stopPropagation(); deleteClipById(clip.id); }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}

            {/* ── Transition joints between adjacent clips on the same track ── */}
            {(() => {
              const SNAP = 0;
              return internalClips.flatMap((clipA) => {
                const endA = clipA.startTime + getEffectiveDuration(clipA);
                return internalClips
                  .filter((clipB) =>
                    clipB.id !== clipA.id &&
                    clipB.trackIndex === clipA.trackIndex &&
                    Math.abs(clipB.startTime - endA) <= SNAP
                  )
                  .map((clipB) => {
                    const joinX = LABEL_W + endA * pxPerSec;
                    const joinY = RULER_H + clipA.trackIndex * CLIP_TRACK_H;
                    const trans = clipTransitions.get(clipB.id);
                    const hasTransition = trans && trans.type !== "cut";
                    const isOpen = transitionPickerFor === clipB.id;
                    const BTN = 32; // w-8 = 32px
                    return (
                      <button
                        key={`tj-${clipA.id}-${clipB.id}`}
                        className={`absolute z-40 rounded-full border-2 flex items-center justify-center transition-all shadow-xl group ${isOpen
                          ? "bg-primary border-primary text-foreground scale-110"
                          : hasTransition
                            ? "bg-primary/20 border-primary text-foreground hover:scale-110"
                            : "bg-background/30 border-white/20 text-muted-foreground hover:border-primary hover:text-primary hover:scale-110"
                          }`}
                        style={{
                          left: joinX - BTN / 2,
                          top: joinY + 4 + (CLIP_TRACK_H - 8 - BTN) / 2,
                          width: BTN,
                          height: BTN,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setTransitionPickerFor((prev) => (prev === clipB.id ? null : clipB.id));
                        }}
                        title={hasTransition ? `Transition: ${trans.type}` : "Add transition"}
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                        </svg>
                        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold bg-gray-900 text-foreground px-2 py-1 rounded-lg shadow-lg border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          {hasTransition ? trans.type : "Add transition"}
                        </span>
                      </button>
                    );
                  });
              });
            })()}

            {/* ── Audio clip blocks (share same track rows as video) ── */}
            {audioClips.map((ac) => {
              const dur = getAudioEffDur(ac);
              const w = Math.max(dur * pxPerSec, 24);
              const left = LABEL_W + ac.startTime * pxPerSec;
              const top = RULER_H + ac.trackIndex * CLIP_TRACK_H;
              const isSelected = ac.id === selectedAudioId;
              return (
                <div
                  key={ac.id}
                  className={`absolute rounded-lg overflow-hidden select-none border-2 cursor-grab active:cursor-grabbing transition-[border,box-shadow] ${isSelected ? "border-teal-400 ring-2 ring-teal-400/30 z-20" : "border-teal-900/60 hover:border-teal-700/80 z-10"
                    }`}
                  style={{ left, top: top + 4, width: w, height: CLIP_TRACK_H - 8 }}
                  onClick={(e) => { e.stopPropagation(); setSelectedAudioId(ac.id); onSelectClip(null); }}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-audio-trim]")) return;
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setSelectedAudioId(ac.id);
                    onSelectClip(null);
                    audioDragRef.current = { id: ac.id, startX: e.clientX, startY: e.clientY, originStart: ac.startTime, originTrack: ac.trackIndex };
                  }}
                  onPointerMove={(e) => {
                    const d = audioDragRef.current;
                    if (!d || d.id !== ac.id) return;
                    const desiredStart = Math.max(0, d.originStart + (e.clientX - d.startX) / pxPerSecRef.current);
                    const newTrack = Math.max(0, Math.min(MAX_TRACKS - 1, Math.round(d.originTrack + (e.clientY - d.startY) / CLIP_TRACK_H)));
                    setAudioClips((prev) => {
                      const me = prev.find((x) => x.id === d.id);
                      if (!me) return prev;
                      const myDur = getAudioEffDur(me);
                      let resolvedStart = desiredStart;
                      if (myDur > 0) {
                        const obstacles = prev
                          .filter((x) => x.id !== d.id && x.trackIndex === newTrack)
                          .map((x) => ({ s: x.startTime, e: x.startTime + getAudioEffDur(x) }))
                          .filter((o) => o.e > o.s)
                          .sort((a, b) => a.s - b.s);
                        for (const o of obstacles) {
                          if (resolvedStart < o.e && resolvedStart + myDur > o.s) {
                            const before = Math.max(0, o.s - myDur);
                            const after = o.e;
                            resolvedStart = Math.abs(desiredStart - before) <= Math.abs(desiredStart - after) ? before : after;
                          }
                        }
                      }
                      return prev.map((x) => x.id === d.id ? { ...x, startTime: resolvedStart, trackIndex: newTrack } : x);
                    });
                  }}
                  onPointerUp={() => { audioDragRef.current = null; }}
                  onPointerCancel={() => { audioDragRef.current = null; }}
                >
                  <div className="absolute inset-0 bg-linear-to-br from-teal-950/90 to-teal-900/50" />
                  {/* Waveform bars */}
                  <div className="absolute inset-0 flex items-center gap-px px-2 overflow-hidden opacity-50">
                    {Array.from({ length: Math.floor(w / 4) }, (_, i) => (
                      <div key={i} className="w-px shrink-0 bg-teal-400 rounded-full"
                        style={{ height: `${30 + Math.sin(i * 0.8) * 20 + Math.sin(i * 0.3) * 15}%` }} />
                    ))}
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                  {/* Music icon + name */}
                  <div className="absolute left-2 top-1.5 flex items-center gap-1">
                    <svg className="w-3 h-3 text-teal-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                    </svg>
                    <span className="text-[9px] font-medium text-teal-300 truncate" style={{ maxWidth: w - 32 }}>{ac.name}</span>
                  </div>
                  {dur > 0 && (
                    <span className="absolute bottom-1 right-2 text-[9px] font-mono text-teal-400/80 bg-black/50 px-1 rounded">
                      {dur.toFixed(1)}s
                    </span>
                  )}
                  {/* Trim handles */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div data-audio-trim className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize pointer-events-auto flex items-center justify-center group/h"
                      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); audioTrimDragRef.current = { id: ac.id, edge: "start", startX: e.clientX, initialValue: ac.trimStart, rawDuration: ac.rawDuration, otherEdge: ac.trimEnd ?? ac.rawDuration }; }}
                      onPointerMove={(e) => { const d = audioTrimDragRef.current; if (!d || d.id !== ac.id || d.edge !== "start") return; const v = Math.max(0, Math.min(d.initialValue + (e.clientX - d.startX) / pxPerSecRef.current, d.otherEdge - 0.1)); setAudioClips((prev) => prev.map((x) => x.id === d.id ? { ...x, trimStart: v } : x)); }}
                      onPointerUp={() => { audioTrimDragRef.current = null; }} onPointerCancel={() => { audioTrimDragRef.current = null; }}
                    ><div className="w-[3px] h-8 rounded-full bg-teal-400/50 group-hover/h:bg-teal-300 transition-colors" /></div>
                    <div data-audio-trim className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize pointer-events-auto flex items-center justify-center group/h"
                      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); audioTrimDragRef.current = { id: ac.id, edge: "end", startX: e.clientX, initialValue: ac.trimEnd ?? ac.rawDuration, rawDuration: ac.rawDuration, otherEdge: ac.trimStart }; }}
                      onPointerMove={(e) => { const d = audioTrimDragRef.current; if (!d || d.id !== ac.id || d.edge !== "end") return; const v = Math.max(d.otherEdge + 0.1, Math.min(d.initialValue + (e.clientX - d.startX) / pxPerSecRef.current, d.rawDuration)); setAudioClips((prev) => prev.map((x) => x.id === d.id ? { ...x, trimEnd: v >= d.rawDuration ? null : v } : x)); }}
                      onPointerUp={() => { audioTrimDragRef.current = null; }} onPointerCancel={() => { audioTrimDragRef.current = null; }}
                    ><div className="w-[3px] h-8 rounded-full bg-teal-400/50 group-hover/h:bg-teal-300 transition-colors" /></div>
                  </div>
                  {isSelected && (
                    <button data-audio-trim
                      className="absolute top-1 left-1.5 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-colors z-10"
                      onClick={(e) => { e.stopPropagation(); setAudioClips((prev) => prev.filter((x) => x.id !== ac.id)); setSelectedAudioId(null); }}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              );
            })}

          </div>
        </div>

        {/* Timeline footer */}
        <div className="shrink-0 border-t border-white/8 flex items-center px-3 gap-4" style={{ height: FOOTER_H }}>
          <span className="text-[10px] text-muted-foreground/30">
            {internalClips.length} {internalClips.length === 1 ? "clip" : "clips"}
            {totalDuration > 0 && ` · ${formatTime(totalDuration)} total`}
          </span>
          {selectedClip && (
            <span className="text-[10px] text-primary">
              Shot {internalClips.findIndex((c) => c.id === selectedClipId) + 1}
              {selectedClip.approved && " · ✓ approved"}
              {selectedClip.reversed && " · reversed"}
              {(selectedClip.trimStart > 0 || selectedClip.trimEnd !== null) && " · trimmed"}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setVideoPickerOpen(true)}
              className="flex items-center gap-1.5 h-5 px-2 rounded text-[10px] text-primary hover:text-primary hover:bg-primary/10 border border-primary/20 hover:border-primary/50 transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add Video
            </button>
            <button
              onClick={() => setAudioPickerOpen(true)}
              className="flex items-center gap-1.5 h-5 px-2 rounded text-[10px] text-teal-500 hover:text-teal-300 hover:bg-teal-500/10 border border-teal-800/50 hover:border-teal-600/50 transition-all"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Add Audio
            </button>
          </div>
        </div>
      </div>

      <MediaPickerDialog
        open={videoPickerOpen}
        onOpenChange={setVideoPickerOpen}
        accept={["video"]}
        title="Add Video"
        onSelect={handleVideoSelect}
      />
      <MediaPickerDialog
        open={audioPickerOpen}
        onOpenChange={setAudioPickerOpen}
        accept={["audio"]}
        title="Add Audio"
        onSelect={handleAudioSelect}
      />

      {/* Trim drag tooltip */}
      {trimTooltip && (
        <div
          className="fixed z-50 bg-gray-900/95 text-primary text-xs font-mono px-2 py-1 rounded shadow-xl border border-white/10 pointer-events-none -translate-x-1/2"
          style={{ left: trimTooltip.x, top: trimTooltip.y - 32 }}
        >
          {trimTooltip.time.toFixed(2)}s
        </div>
      )}
    </div>
  );
}
