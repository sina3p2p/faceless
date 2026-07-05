"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { type PlayerRef } from "@remotion/player";
import { preloadVideo } from "@remotion/preload";
import { getVideoMetadata } from "@remotion/media-utils";
import { type StoryCompositionProps, type AudioClipConfig, computeSequenceLayout, FPS } from "@/remotion/StoryComposition";
import { FloatingPanel } from "../floating-panel";
import { Timeline } from "./timeline";
import { formatTime } from "./use-pointer-drag";
import type { InternalClip, AudioClip, TransitionSetting } from "./types";
import { SpeedPanel, type SpeedMode, type CurvePoint } from "./panel/speed-panel";
import { VolumePanel } from "./panel/volume-panel";
import { AiEditPanel } from "./panel/ai-edit-panel";
import { ExportPanel } from "./panel/export-panel";
import { ComingSoonPanel } from "./panel/coming-soon-panel";
import { TransitionPickerPanel } from "./panel/transition-picker-panel";
import PlayerView from "./player-view";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Clip = {
  toolCallId: string;
  videoUrl: string;
  approved?: boolean;
};

type ToolTab = "speed" | "volume" | "text" | "audio" | "effects" | "export" | "ai-edit";

interface VideoEditorPanelProps {
  clips: Clip[];
  sessionId: string;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  isHidden?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInternalClip(c: Clip, startTime = 0, trackIndex = 0): InternalClip {
  return { id: c.toolCallId, sourceId: c.toolCallId, videoUrl: c.videoUrl, approved: c.approved, startTime, trackIndex, trimStart: 0, trimEnd: null, reversed: false };
}


// ─── Main Panel ───────────────────────────────────────────────────────────────

export function VideoEditorPanel({ clips, sessionId, selectedClipId, onSelectClip, isHidden }: VideoEditorPanelProps) {
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
  const [activeTab, setActiveTab] = useState<ToolTab | null>(null);
  const [clipSpeeds, setClipSpeeds] = useState<Map<string, number>>(new Map());
  const [clipVolumes, setClipVolumes] = useState<Map<string, number>>(new Map());
  const [clipSpeedModes, setClipSpeedModes] = useState<Map<string, SpeedMode>>(new Map());
  const [clipCurvePoints, setClipCurvePoints] = useState<Map<string, CurvePoint[]>>(new Map());
  const [clipCurvePresets, setClipCurvePresets] = useState<Map<string, string>>(new Map());
  const [clipFadeIns, setClipFadeIns] = useState<Map<string, number>>(new Map());
  const [clipFadeOuts, setClipFadeOuts] = useState<Map<string, number>>(new Map());

  // Transitions between clips
  const [clipTransitions, setClipTransitions] = useState<Map<string, TransitionSetting>>(new Map());
  const [transitionPickerFor, setTransitionPickerFor] = useState<string | null>(null);

  // ── Audio clips ───────────────────────────────────────────────────────────
  const [audioClips, setAudioClips] = useState<AudioClip[]>([]);

  const getAudioEffDur = useCallback((ac: AudioClip) => {
    if (!ac.rawDuration) return 0;
    const end = ac.trimEnd ?? ac.rawDuration;
    return Math.max(0, end - ac.trimStart);
  }, []);

  // Export state
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  // Remotion Player ref
  const playerRef = useRef<PlayerRef>(null);

  // ── sync internalClips from props ─────────────────────────────────────────
  // Merges server-pushed clip updates into local editable state; local edits
  // (trim/position/etc.) are preserved for clips that still exist upstream.

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- merge logic must run once, not scattered across every internalClips-mutating call site
    setInternalClips((prev) => {
      const validSourceIds = new Set(clips.map((c) => c.toolCallId));
      const filtered = prev.filter((c) => validSourceIds.has(c.sourceId));
      let changed = filtered.length !== prev.length;
      const updated = filtered.map((c) => {
        const src = clips.find((s) => s.toolCallId === c.sourceId);
        if (!src || (src.videoUrl === c.videoUrl && src.approved === c.approved)) return c;
        changed = true;
        return { ...c, videoUrl: src.videoUrl, approved: src.approved };
      });
      const existingSourceIds = new Set(updated.map((c) => c.sourceId));
      const incoming = clips.filter((c) => !existingSourceIds.has(c.toolCallId));
      if (incoming.length === 0) return changed ? updated : prev;

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

  // Closes the 5s placeholder gap once a clip's real duration is known: shifts
  // subsequent track-0 clips so they follow immediately after the real end.
  const applyRealDuration = useCallback((id: string, realDur: number) => {
    if (clipMeta.has(id)) return;
    setClipMeta((prev) => new Map(prev).set(id, realDur));
    setInternalClips((prev) => {
      const idx = prev.findIndex((x) => x.id === id);
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
  }, [clipMeta]);

  // ── preload clip videos so OffthreadVideo has no seek delay ────────────────
  // preloadVideo() just hints the browser via <link rel=preload> — no fetch(),
  // so no CORS requirement (unlike remotion's prefetch()). Duration is read
  // separately via getVideoMetadata, which uses a <video> element and is also
  // CORS-free (only pixel reads need CORS, not metadata/duration).
  const preloadsRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    const active = preloadsRef.current;
    const byUrl = new Map<string, string[]>();
    for (const c of internalClips) {
      byUrl.set(c.videoUrl, [...(byUrl.get(c.videoUrl) ?? []), c.id]);
    }
    for (const [url, unpreload] of active) {
      if (!byUrl.has(url)) {
        unpreload();
        active.delete(url);
      }
    }
    for (const [url, ids] of byUrl) {
      if (active.has(url)) continue;
      active.set(url, preloadVideo(url));
      getVideoMetadata(url)
        .then(({ durationInSeconds }) => {
          for (const id of ids) applyRealDuration(id, durationInSeconds);
        })
        .catch(() => { });
    }
  }, [internalClips, applyRealDuration]);

  useEffect(() => () => {
    for (const unpreload of preloadsRef.current.values()) unpreload();
  }, []);

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

  // ── auto-remove transitions when clips are no longer adjacent ─────────────

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- single choke point for pruning stale transitions; internalClips is mutated from ~10 call sites in Timeline
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
  // Re-runs whenever clips change (including 0 → >0, when the Player first
  // mounts and playerRef gets populated). addEventListener/removeEventListener
  // here are just array push/filter on an in-memory emitter, not real DOM
  // listeners, so re-wiring on every clip edit costs nothing.

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;
    const onTimeUpdate = () => {
      const t = player.getCurrentFrame() / FPS;
      setCurrentTime(t);
      let idx = 0;
      let bestTrack = Infinity;
      for (let i = 0; i < internalClips.length; i++) {
        const c = internalClips[i]!;
        const end = c.startTime + (clipMeta.get(c.id) ?? 0);
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
  }, [internalClips, clipMeta]);

  // ── playback ──────────────────────────────────────────────────────────────

  function togglePlay(e?: React.SyntheticEvent) {
    if (internalClips.length === 0) return;
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      if (currentTime >= totalDuration && totalDuration > 0) { seekTo(0); return; }
      playerRef.current?.play(e);
    }
  }

  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(clamped);
    playerRef.current?.seekTo(Math.round(clamped * FPS));
  }

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

  const videoPreviewRef = useRef<HTMLDivElement>(null);

  // ── per-clip controls ─────────────────────────────────────────────────────

  const selectedClip = internalClips.find((c) => c.id === selectedClipId) ?? null;

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

  // ── render ────────────────────────────────────────────────────────────────

  if (isHidden) return null;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      {/* ── Tool Tab Bar ── */}
      <div className="flex items-center gap-1 px-3 h-12 border-b border-white/10 bg-black/20 backdrop-blur-md shrink-0 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab((prev) => (prev === tab.id ? null : tab.id))}
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
        <FloatingPanel
          containerRef={videoPreviewRef}
          initialPos={{ x: 16, y: 16 }}
          title={activeTab ?? ""}
          icon={TABS.find((t) => t.id === activeTab)?.icon}
          visible={activeTab !== null}
          setVisible={(visible) => setActiveTab(visible ? activeTab : null)}
          width={300}
          zIndex={30}
        >
          <div className="max-h-[70vh] overflow-y-auto">
            {activeTab === "speed" && (
              <SpeedPanel
                selectedClipId={selectedClipId}
                getRawDuration={getRawDuration}
                clipSpeeds={clipSpeeds}
                setClipSpeeds={setClipSpeeds}
                clipSpeedModes={clipSpeedModes}
                setClipSpeedModes={setClipSpeedModes}
                clipCurvePoints={clipCurvePoints}
                setClipCurvePoints={setClipCurvePoints}
                clipCurvePresets={clipCurvePresets}
                setClipCurvePresets={setClipCurvePresets}
              />
            )}
            {activeTab === "volume" && (
              <VolumePanel
                selectedClipId={selectedClipId}
                clipVolumes={clipVolumes}
                setClipVolumes={setClipVolumes}
                clipFadeIns={clipFadeIns}
                setClipFadeIns={setClipFadeIns}
                clipFadeOuts={clipFadeOuts}
                setClipFadeOuts={setClipFadeOuts}
              />
            )}
            {activeTab === "ai-edit" && (
              <AiEditPanel
                sessionId={sessionId}
                selectedClipId={selectedClipId}
                internalClips={internalClips}
                setInternalClips={setInternalClips}
                setClipMeta={setClipMeta}
                onSelectClip={onSelectClip}
                getRawDuration={getRawDuration}
              />
            )}
            {(activeTab === "text" || activeTab === "audio" || activeTab === "effects") && (
              <ComingSoonPanel tab={activeTab} />
            )}
            {activeTab === "export" && <ExportPanel internalClips={internalClips} />}
          </div>
        </FloatingPanel>
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
          <PlayerView playerRef={playerRef} compositionProps={compositionProps} totalFrames={totalFrames} />
        )}

        {internalClips.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
            <span className="text-xs font-mono text-white/70">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        )}

        <TransitionPickerPanel
          containerRef={videoPreviewRef}
          transitionPickerFor={transitionPickerFor}
          internalClips={internalClips}
          clipTransitions={clipTransitions}
          setClipTransitions={setClipTransitions}
          visible={transitionPickerFor !== null}
          setVisible={(visible) => setTransitionPickerFor(visible ? transitionPickerFor : null)}
        />
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

      <Timeline
        internalClips={internalClips}
        setInternalClips={setInternalClips}
        audioClips={audioClips}
        setAudioClips={setAudioClips}
        selectedClipId={selectedClipId}
        onSelectClip={onSelectClip}
        activeClipIndex={activeClipIndex}
        clipTransitions={clipTransitions}
        transitionPickerFor={transitionPickerFor}
        setTransitionPickerFor={setTransitionPickerFor}
        pxPerSec={pxPerSec}
        setPxPerSec={setPxPerSec}
        collapsed={timelineCollapsed}
        currentTime={currentTime}
        totalDuration={totalDuration}
        getEffectiveDuration={getEffectiveDuration}
        getRawDuration={getRawDuration}
        getAudioEffDur={getAudioEffDur}
        seekTo={seekTo}
        deleteClipById={deleteClipById}
      />
    </div>
  );
}
