"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { MediaPickerDialog, type MediaItem as LibraryMediaItem } from "@/components/ui/media-picker-dialog";
import { usePointerDrag, formatTime } from "./use-pointer-drag";
import type { AudioClip, InternalClip, TransitionSetting } from "./types";

// Layout constants
const RULER_H = 28;
const CLIP_TRACK_H = 68;
const FOOTER_H = 28;
const LABEL_W = 68;
const MAX_TRACKS = 8;
const FILMSTRIP_TILES = 6;

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

export interface TimelineProps {
  internalClips: InternalClip[];
  setInternalClips: Dispatch<SetStateAction<InternalClip[]>>;
  audioClips: AudioClip[];
  setAudioClips: Dispatch<SetStateAction<AudioClip[]>>;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  activeClipIndex: number;
  clipTransitions: Map<string, TransitionSetting>;
  transitionPickerFor: string | null;
  setTransitionPickerFor: Dispatch<SetStateAction<string | null>>;
  pxPerSec: number;
  setPxPerSec: Dispatch<SetStateAction<number>>;
  collapsed: boolean;
  currentTime: number;
  totalDuration: number;
  getEffectiveDuration: (clip: InternalClip) => number;
  getRawDuration: (id: string) => number;
  getAudioEffDur: (ac: AudioClip) => number;
  seekTo: (t: number) => void;
  deleteClipById: (id: string) => void;
}

export function Timeline({
  internalClips,
  setInternalClips,
  audioClips,
  setAudioClips,
  selectedClipId,
  onSelectClip,
  activeClipIndex,
  clipTransitions,
  transitionPickerFor,
  setTransitionPickerFor,
  pxPerSec,
  setPxPerSec,
  collapsed,
  currentTime,
  totalDuration,
  getEffectiveDuration,
  getRawDuration,
  getAudioEffDur,
  seekTo,
  deleteClipById,
}: TimelineProps) {
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);

  const timelineRef = useRef<HTMLDivElement>(null);
  const pxPerSecRef = useRef(pxPerSec);
  useLayoutEffect(() => {
    pxPerSecRef.current = pxPerSec;
  });
  const pendingScrollRef = useRef<number | null>(null);

  // Trim drag tooltip
  const [trimTooltip, setTrimTooltip] = useState<{ x: number; y: number; time: number } | null>(null);

  // Playhead local state — tracks position during drag for instant visual feedback
  const [localPlayheadTime, setLocalPlayheadTime] = useState<number | null>(null);
  const displayTime = localPlayheadTime ?? currentTime;

  // Blue hover cursor
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  function addVideoToTimeline(videoUrl: string, id?: string) {
    const clipId = id ?? `user-${Date.now()}`;
    const lastEnd = Math.max(0, ...internalClips.filter((c) => c.trackIndex === 0).map((c) => c.startTime + (getRawDuration(c.id) || 5)));
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
          ...internalClips.map((c) => c.trackIndex),
          ...prev.map((ac) => ac.trackIndex),
        ]);
        let trackIndex = 0;
        while (usedTracks.has(trackIndex)) trackIndex++;
        return [...prev, { id, url: item.url, name: item.prompt ?? "audio", startTime: 0, trackIndex, trimStart: 0, trimEnd: null, rawDuration: dur, volume: 1 }];
      });
      setSelectedAudioId(id);
    }, { once: true });
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

  const audioDragRef = useRef<{ id: string; startX: number; startY: number; originStart: number; originTrack: number } | null>(null);
  const audioTrimDragRef = useRef<{ id: string; edge: "start" | "end"; startX: number; initialValue: number; rawDuration: number; otherEdge: number } | null>(null);

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
      const t = Math.max(0, Math.min(state.startTime + (clientX - state.startX) / pxPerSecRef.current, totalDuration));
      setLocalPlayheadTime(t);
      seekTo(t);
    },
    () => {
      setLocalPlayheadTime(null);
    },
  );

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

  // ── ruler ─────────────────────────────────────────────────────────────────

  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const totalTicks = totalDuration > 0 ? Math.ceil(totalDuration / tickInterval) + 2 : 20;
  const timelineContentWidth = Math.max(totalDuration * pxPerSec + 96, 600);

  // ── timeline geometry ─────────────────────────────────────────────────────

  // Audio and video clips share the same track rows
  const numTracks = Math.min(MAX_TRACKS, Math.max(3,
    ...internalClips.map((c) => c.trackIndex + 2),
    ...audioClips.map((ac) => ac.trackIndex + 2),
  ));
  const timelineH = RULER_H + numTracks * CLIP_TRACK_H + FOOTER_H;

  return (
    <>
      {/* ── Timeline ── */}
      <div
        className="shrink-0 border-t border-white/8 bg-black/25 backdrop-blur-md flex flex-col overflow-hidden"
        style={{ height: collapsed ? 0 : timelineH, transition: "height 200ms ease" }}
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
          {selectedClipId && (() => {
            const selectedClip = internalClips.find((c) => c.id === selectedClipId);
            if (!selectedClip) return null;
            return (
              <span className="text-[10px] text-primary">
                Shot {internalClips.findIndex((c) => c.id === selectedClipId) + 1}
                {selectedClip.approved && " · ✓ approved"}
                {selectedClip.reversed && " · reversed"}
                {(selectedClip.trimStart > 0 || selectedClip.trimEnd !== null) && " · trimmed"}
              </span>
            );
          })()}
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
    </>
  );
}
