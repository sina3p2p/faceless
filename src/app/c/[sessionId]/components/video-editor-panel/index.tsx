"use client";

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { type PlayerRef } from "@remotion/player";
import { prefetch } from "remotion";
import { getVideoMetadata } from "@remotion/media-utils";
import { type StoryCompositionProps, type AudioClipConfig, computeSequenceLayout, FPS } from "@/remotion/StoryComposition";
import { FloatingPanel } from "../floating-panel";
import { Timeline } from "./timeline";
import { trackIdOf, trackIndexOf, nextFreeTrackIndex } from "./timeline/hooks/use-timeline-tracks";
import type { InternalClip, AudioClip, TransitionSetting, TimelineTrack, NewTimelineItemInput } from "./timeline/types";
import { SpeedPanel, type SpeedMode, type CurvePoint } from "./panel/speed-panel";
import { VolumePanel } from "./panel/volume-panel";
import { AiEditPanel } from "./panel/ai-edit-panel";
import { ExportPanel } from "./panel/export-panel";
import { ComingSoonPanel } from "./panel/coming-soon-panel";
import { TransitionPickerPanel } from "./panel/transition-picker-panel";
import { EmptyEditorState } from "./empty-editor-state";
import PlayerView from "./player-view";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Clip = {
  toolCallId: string;
  videoUrl: string;
  duration?: number;
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

interface HistorySnapshot {
  clips: InternalClip[];
  audioClips: AudioClip[];
  transitions: Map<string, TransitionSetting>;
}

const HISTORY_COALESCE_MS = 300;
const HISTORY_LIMIT = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInternalClip(c: Clip, startTime = 0, trackIndex = 0): InternalClip {
  return { id: c.toolCallId, sourceId: c.toolCallId, videoUrl: c.videoUrl, approved: c.approved, startTime, trackIndex, trimStart: 0, trimEnd: null, reversed: false };
}

// Classic array-move reindexing for dragging a track to a new position:
// the moved track takes `toIndex`, everything strictly between the two
// shifts by one to close the gap.
function remapTrackIndex(fromIndex: number, toIndex: number, trackIndex: number): number {
  if (trackIndex === fromIndex) return toIndex;
  if (fromIndex < toIndex) {
    if (trackIndex > fromIndex && trackIndex <= toIndex) return trackIndex - 1;
  } else {
    if (trackIndex >= toIndex && trackIndex < fromIndex) return trackIndex + 1;
  }
  return trackIndex;
}

function buildTracks(
  clips: InternalClip[],
  audioClips: AudioClip[],
  getEffectiveDuration: (clip: InternalClip) => number,
  getAudioEffDur: (ac: AudioClip) => number,
): TimelineTrack[] {
  const byTrack = new Map<number, TimelineTrack["items"]>();
  for (const clip of clips) {
    const items = byTrack.get(clip.trackIndex) ?? [];
    items.push({
      id: clip.id,
      trackId: trackIdOf(clip.trackIndex),
      start: clip.startTime,
      end: clip.startTime + getEffectiveDuration(clip),
      type: "video",
      label: clip.sourceId,
      color: "#7c3aed",
      clip,
    });
    byTrack.set(clip.trackIndex, items);
  }
  for (const ac of audioClips) {
    const items = byTrack.get(ac.trackIndex) ?? [];
    items.push({
      id: ac.id,
      trackId: trackIdOf(ac.trackIndex),
      start: ac.startTime,
      end: ac.startTime + getAudioEffDur(ac),
      type: "audio",
      label: ac.name,
      color: "#14b8a6",
      clip: ac,
    });
    byTrack.set(ac.trackIndex, items);
  }
  return Array.from(byTrack.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([idx, items]) => ({ id: trackIdOf(idx), name: idx === 0 ? "Main" : `T${idx + 1}`, items }));
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function VideoEditorPanel({ clips, sessionId, selectedClipId, onSelectClip, isHidden }: VideoEditorPanelProps) {
  const [internalClips, setInternalClips] = useState<InternalClip[]>(() => {
    // Space clips sequentially on track 0 using each clip's known duration
    // (reported by the generation provider) where available, falling back to
    // a 5s placeholder for clips that predate that being stored. Real
    // durations for placeholder clips load asynchronously via onLoadedMetadata.
    let cursor = 0;
    return clips.map((c) => {
      const clip = toInternalClip(c, cursor, 0);
      cursor += c.duration ?? 5;
      return clip;
    });
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [clipMeta, setClipMeta] = useState<Map<string, number>>(
    () => new Map(clips.filter((c) => c.duration != null).map((c) => [c.toolCallId, c.duration!])),
  );
  const [playbackRate, setPlaybackRate] = useState(1);
  const [trackLocks, setTrackLocks] = useState<Set<number>>(new Set());
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

  // ── undo/redo history ─────────────────────────────────────────────────────
  // One generic mechanism: snapshot {clips, audioClips, transitions} before any
  // history-tracked update, coalesced to at most once per 300ms so a whole drag
  // gesture collapses into a single undo step.
  const historyStateRef = useRef<HistorySnapshot>({ clips: internalClips, audioClips, transitions: clipTransitions });
  useLayoutEffect(() => {
    historyStateRef.current = { clips: internalClips, audioClips, transitions: clipTransitions };
  });
  const pastRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  const lastSnapshotAtRef = useRef(0);
  const [historyTick, setHistoryTick] = useState(0);

  function snapshotHistory() {
    const now = Date.now();
    if (now - lastSnapshotAtRef.current > HISTORY_COALESCE_MS) {
      pastRef.current = [...pastRef.current, historyStateRef.current].slice(-HISTORY_LIMIT);
      futureRef.current = [];
      lastSnapshotAtRef.current = now;
      setHistoryTick((t) => t + 1);
    }
  }

  function setInternalClipsH(updater: React.SetStateAction<InternalClip[]>) {
    snapshotHistory();
    setInternalClips(updater);
  }
  function setAudioClipsH(updater: React.SetStateAction<AudioClip[]>) {
    snapshotHistory();
    setAudioClips(updater);
  }
  function setClipTransitionsH(updater: React.SetStateAction<Map<string, TransitionSetting>>) {
    snapshotHistory();
    setClipTransitions(updater);
  }

  function undo() {
    const prev = pastRef.current[pastRef.current.length - 1];
    if (!prev) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, historyStateRef.current];
    setInternalClips(prev.clips);
    setAudioClips(prev.audioClips);
    setClipTransitions(prev.transitions);
    setHistoryTick((t) => t + 1);
  }
  function redo() {
    const next = futureRef.current[futureRef.current.length - 1];
    if (!next) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, historyStateRef.current];
    setInternalClips(next.clips);
    setAudioClips(next.audioClips);
    setClipTransitions(next.transitions);
    setHistoryTick((t) => t + 1);
  }
  // historyTick is read here only to force a re-render after undo/redo/snapshot
  void historyTick;
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  // ── sync internalClips from props ─────────────────────────────────────────
  // Merges server-pushed clip updates into local editable state; local edits
  // (trim/position/etc.) are preserved for clips that still exist upstream.
  // Not history-tracked — this is an automatic sync, not a user gesture.

  useEffect(() => {
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
        cursor += c.duration ?? clipMeta.get(c.toolCallId) ?? 5;
        return clip;
      });
      const known = incoming.filter((c) => c.duration != null);
      if (known.length > 0) {
        setClipMeta((prevMeta) => {
          const next = new Map(prevMeta);
          for (const c of known) if (!next.has(c.toolCallId)) next.set(c.toolCallId, c.duration!);
          return next;
        });
      }
      return [...updated, ...newClips];
    });
  }, [clips]); // eslint-disable-line react-hooks/exhaustive-deps

  // Closes the 5s placeholder gap once a clip's real duration is known.
  // Re-derives every "pristine" track-0 clip's position from scratch using
  // the best durations known so far (real where resolved, 5s placeholder
  // otherwise), rather than nudging only the immediate next clip — video
  // metadata for several clips can resolve concurrently and in any order,
  // and a single-hop shift only produces a correctly packed layout when
  // clips happen to resolve strictly left to right. A clip stops being
  // "pristine" (and layout stops auto-adjusting from that point on) as soon
  // as its position no longer matches what the auto-layout would have put
  // it at, which is how a user's manual drag is preserved.
  // Not history-tracked — this is an automatic correction, not a user gesture.
  //
  // clipMetaRef (kept fresh via the layout effect below) is read here instead
  // of `clipMeta` directly — this function is only ever invoked from async
  // getVideoMetadata callbacks, so closing over `clipMeta` would pin it to
  // whatever it was when the *effect* last ran, not when each resolution
  // actually lands. That made every resolution after the first overwrite
  // clipMeta from a stale snapshot instead of building on the latest one —
  // durations from earlier-resolved clips were silently lost.
  const clipMetaRef = useRef(clipMeta);
  useLayoutEffect(() => {
    clipMetaRef.current = clipMeta;
  });

  const applyRealDuration = useCallback((id: string, realDur: number) => {
    if (clipMetaRef.current.has(id)) return;
    setClipMeta((prev) => (prev.has(id) ? prev : new Map(prev).set(id, realDur)));
    setInternalClips((prev) => {
      const priorMeta = clipMetaRef.current;
      const durationOf = (clipId: string) => (clipId === id ? realDur : priorMeta.get(clipId) ?? 5);
      let oldCursor = 0;
      let newCursor = 0;
      let pristine = true;
      let changed = false;
      const next = prev.map((c) => {
        if (c.trackIndex !== 0) return c;
        if (pristine) {
          pristine = Math.abs(c.startTime - oldCursor) < 0.1;
        }
        oldCursor += priorMeta.get(c.id) ?? 5;
        if (!pristine) {
          newCursor = c.startTime + durationOf(c.id);
          return c;
        }
        const placed = Math.abs(c.startTime - newCursor) < 0.01 ? c : { ...c, startTime: newCursor };
        if (placed !== c) changed = true;
        newCursor += durationOf(c.id);
        return placed;
      });
      return changed ? next : prev;
    });
  }, []);

  // ── prefetch clip videos into Remotion's blob cache ───────────────────────
  // remotion's prefetch() is what OffthreadVideo's usePreload() actually reads.
  // @remotion/preload's preloadVideo() only hints the browser and does not
  // feed that cache. Prefetch hits signed R2 URLs directly (requires CORS).
  // Duration still comes from getVideoMetadata.
  const prefetchesRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    const active = prefetchesRef.current;
    const byUrl = new Map<string, string[]>();
    for (const c of internalClips) {
      byUrl.set(c.videoUrl, [...(byUrl.get(c.videoUrl) ?? []), c.id]);
    }
    for (const [url, free] of active) {
      if (!byUrl.has(url)) {
        free();
        active.delete(url);
      }
    }
    for (const [url, ids] of byUrl) {
      if (active.has(url)) continue;
      const { free } = prefetch(url);
      active.set(url, free);
      getVideoMetadata(url)
        .then(({ durationInSeconds }) => {
          for (const id of ids) applyRealDuration(id, durationInSeconds);
        })
        .catch((err) => { console.error("getVideoMetadata failed", url, err); });
    }
  }, [internalClips, applyRealDuration]);

  useEffect(() => () => {
    for (const free of prefetchesRef.current.values()) free();
  }, []);

  // ── derived ───────────────────────────────────────────────────────────────

  const getRawDuration = useCallback((id: string) => clipMeta.get(id) ?? 0, [clipMeta]);

  const getEffectiveDuration = useCallback((clip: InternalClip) => {
    const raw = getRawDuration(clip.id);
    if (!raw) return 0;
    const end = clip.trimEnd ?? raw;
    return Math.max(0, end - clip.trimStart);
  }, [getRawDuration]);

  // A locked track's items can't be moved/trimmed/deleted/duplicated/split —
  // enforced once here rather than scattered across every call site.
  function isItemLocked(id: string): boolean {
    const clip = internalClips.find((c) => c.id === id);
    if (clip) return trackLocks.has(clip.trackIndex);
    const ac = audioClips.find((a) => a.id === id);
    return ac ? trackLocks.has(ac.trackIndex) : false;
  }

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
      setCurrentTime(player.getCurrentFrame() / FPS);
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
  }, [internalClips]);

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

  function playH() {
    togglePlay();
  }
  function pauseH() {
    playerRef.current?.pause();
  }

  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    setCurrentTime(clamped);
    playerRef.current?.seekTo(Math.round(clamped * FPS));
  }

  const videoPreviewRef = useRef<HTMLDivElement>(null);

  // ── selection ─────────────────────────────────────────────────────────────
  // selectedItemIds is the Timeline's own multi-select (marquee); the external
  // selectedClipId/onSelectClip prop pair (owned by story-chat.tsx) mirrors the
  // single-video-clip case, kept in sync both ways.

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(() => (selectedClipId ? [selectedClipId] : []));

  // Mirror local multi-select → parent single-select. Guard with !== so we
  // don't call setState on every internalClips identity change (that ping-pongs
  // with the effect below and blows the update-depth limit).
  useEffect(() => {
    const single = selectedItemIds.length === 1 ? selectedItemIds[0]! : null;
    const derived = single !== null && internalClips.some((c) => c.id === single) ? single : null;
    if (derived !== selectedClipId) onSelectClip(derived);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSelectClip is stable setState from parent
  }, [selectedItemIds, internalClips, selectedClipId]);

  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (selectedClipId === null) {
        // Parent cleared (e.g. preview click) — drop a lone mirrored selection,
        // but keep true multi-select (length > 1) which has no parent equivalent.
        if (prev.length <= 1) return prev.length === 0 ? prev : [];
        return prev;
      }
      if (prev.length === 1 && prev[0] === selectedClipId) return prev;
      return [selectedClipId];
    });
  }, [selectedClipId]);

  // ── split ─────────────────────────────────────────────────────────────────

  function onSplitItemsH(itemId: string, splitTime: number) {
    if (isItemLocked(itemId)) return;
    const clipIdx = internalClips.findIndex((c) => c.id === itemId);
    if (clipIdx < 0) return;
    const clip = internalClips[clipIdx]!;
    const localEffTime = splitTime - clip.startTime;
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
    setInternalClipsH((prev) => {
      const next = [...prev];
      next.splice(clipIdx, 1, part1, part2);
      return next;
    });
    setSelectedItemIds([part2.id]);
  }

  // ── reverse ───────────────────────────────────────────────────────────────

  function onReverseItemsH(ids: string[]) {
    const idSet = new Set(ids.filter((id) => !isItemLocked(id)));
    if (idSet.size === 0) return;
    setInternalClipsH((prev) => prev.map((c) => (idSet.has(c.id) ? { ...c, reversed: !c.reversed } : c)));
  }

  // ── delete / duplicate (support multi-item selection) ─────────────────────

  function onDeleteItemsH(ids: string[]) {
    const idSet = new Set(ids.filter((id) => !isItemLocked(id)));
    if (idSet.size === 0) return;
    setInternalClipsH((prev) => prev.filter((c) => !idSet.has(c.id)));
    setAudioClipsH((prev) => prev.filter((ac) => !idSet.has(ac.id)));
    setSelectedItemIds((prev) => prev.filter((id) => !idSet.has(id)));
  }

  function onDuplicateItemsH(ids: string[]) {
    const newIds: string[] = [];
    for (const id of ids) {
      if (isItemLocked(id)) continue;
      const src = internalClips.find((c) => c.id === id);
      if (src) {
        const dur = getEffectiveDuration(src);
        const copy: InternalClip = { ...src, id: `${src.sourceId}-d${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, startTime: src.startTime + dur };
        const raw = getRawDuration(src.id);
        if (raw > 0) setClipMeta((prev) => new Map(prev).set(copy.id, raw));
        setInternalClipsH((prev) => [...prev, copy]);
        newIds.push(copy.id);
        continue;
      }
      const srcAudio = audioClips.find((ac) => ac.id === id);
      if (srcAudio) {
        const dur = getAudioEffDur(srcAudio);
        const copy: AudioClip = { ...srcAudio, id: `${srcAudio.id}-d${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, startTime: srcAudio.startTime + dur };
        setAudioClipsH((prev) => [...prev, copy]);
        newIds.push(copy.id);
      }
    }
    if (newIds.length > 0) setSelectedItemIds(newIds);
  }

  // ── move / resize (drag + trim) ───────────────────────────────────────────

  function onItemMoveH(itemId: string, newStart: number, newEnd: number, newTrackId: string) {
    void newEnd; // move never changes duration
    if (isItemLocked(itemId)) return;
    const newTrackIndex = trackIndexOf(newTrackId);
    if (internalClips.some((c) => c.id === itemId)) {
      setInternalClipsH((prev) => prev.map((c) => (c.id === itemId ? { ...c, startTime: newStart, trackIndex: newTrackIndex } : c)));
    } else {
      setAudioClipsH((prev) => prev.map((ac) => (ac.id === itemId ? { ...ac, startTime: newStart, trackIndex: newTrackIndex } : ac)));
    }
  }

  function onItemResizeH(itemId: string, newStart: number, newEnd: number) {
    if (isItemLocked(itemId)) return;
    const videoItem = internalClips.find((c) => c.id === itemId);
    if (videoItem) {
      const raw = getRawDuration(itemId);
      const deltaStart = newStart - videoItem.startTime;
      const newTrimStart = Math.max(0, Math.min(videoItem.trimStart + deltaStart, raw));
      const newTrimEndRaw = newTrimStart + (newEnd - newStart);
      const newTrimEnd = raw > 0 && newTrimEndRaw >= raw ? null : newTrimEndRaw;
      setInternalClipsH((prev) => prev.map((c) => (c.id === itemId ? { ...c, startTime: newStart, trimStart: newTrimStart, trimEnd: newTrimEnd } : c)));
      return;
    }
    const audioItem = audioClips.find((ac) => ac.id === itemId);
    if (audioItem) {
      const raw = audioItem.rawDuration;
      const deltaStart = newStart - audioItem.startTime;
      const newTrimStart = Math.max(0, Math.min(audioItem.trimStart + deltaStart, raw));
      const newTrimEndRaw = newTrimStart + (newEnd - newStart);
      const newTrimEnd = raw > 0 && newTrimEndRaw >= raw ? null : newTrimEndRaw;
      setAudioClipsH((prev) => prev.map((ac) => (ac.id === itemId ? { ...ac, startTime: newStart, trimStart: newTrimStart, trimEnd: newTrimEnd } : ac)));
    }
  }

  // ── add new items ─────────────────────────────────────────────────────────

  function onAddNewItemH(item: NewTimelineItemInput) {
    if (item.type === "video") {
      const clipId = item.id ?? `user-${Date.now()}`;
      const lastEnd = Math.max(0, ...internalClips.filter((c) => c.trackIndex === 0).map((c) => c.startTime + (getRawDuration(c.id) || 5)));
      setInternalClipsH((prev) => [...prev, { id: clipId, sourceId: clipId, videoUrl: item.videoUrl, startTime: lastEnd, trackIndex: 0, trimStart: 0, trimEnd: null, reversed: false }]);
      if (item.duration != null) setClipMeta((prev) => new Map(prev).set(clipId, item.duration!));
      setSelectedItemIds([clipId]);
      return;
    }
    const usedTracks = new Set([...internalClips.map((c) => c.trackIndex), ...audioClips.map((ac) => ac.trackIndex)]);
    const trackIndex = nextFreeTrackIndex(usedTracks);
    const id = `audio-${Date.now()}`;
    setAudioClipsH((prev) => [...prev, { id, url: item.url, name: item.name, startTime: 0, trackIndex, trimStart: 0, trimEnd: null, rawDuration: item.rawDuration, volume: 1 }]);
    setSelectedItemIds([id]);
  }

  // ── full-replace fallback (no dedicated event covers this) ────────────────

  function onTracksChangeH(newTracks: TimelineTrack[]) {
    const nextClips: InternalClip[] = [];
    const nextAudio: AudioClip[] = [];
    for (const track of newTracks) {
      for (const item of track.items) {
        if (item.type === "video") nextClips.push(item.clip);
        else nextAudio.push(item.clip);
      }
    }
    setInternalClipsH(nextClips);
    setAudioClipsH(nextAudio);
  }

  // ── track lock / delete / reorder ─────────────────────────────────────────

  function onTrackLockToggleH(trackIndex: number) {
    setTrackLocks((prev) => {
      const next = new Set(prev);
      if (next.has(trackIndex)) next.delete(trackIndex);
      else next.add(trackIndex);
      return next;
    });
  }

  function onTrackDeleteH(trackIndex: number) {
    setInternalClipsH((prev) =>
      prev
        .filter((c) => c.trackIndex !== trackIndex)
        .map((c) => (c.trackIndex > trackIndex ? { ...c, trackIndex: c.trackIndex - 1 } : c))
    );
    setAudioClipsH((prev) =>
      prev
        .filter((ac) => ac.trackIndex !== trackIndex)
        .map((ac) => (ac.trackIndex > trackIndex ? { ...ac, trackIndex: ac.trackIndex - 1 } : ac))
    );
    setTrackLocks((prev) => {
      const next = new Set<number>();
      for (const idx of prev) {
        if (idx === trackIndex) continue;
        next.add(idx > trackIndex ? idx - 1 : idx);
      }
      return next;
    });
  }

  function onTrackReorderH(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setInternalClipsH((prev) => prev.map((c) => ({ ...c, trackIndex: remapTrackIndex(fromIndex, toIndex, c.trackIndex) })));
    setAudioClipsH((prev) => prev.map((ac) => ({ ...ac, trackIndex: remapTrackIndex(fromIndex, toIndex, ac.trackIndex) })));
    setTrackLocks((prev) => {
      const next = new Set<number>();
      for (const idx of prev) next.add(remapTrackIndex(fromIndex, toIndex, idx));
      return next;
    });
  }

  // ── tracks adapter for the Timeline controlled component ──────────────────

  const tracks = useMemo(
    () => buildTracks(internalClips, audioClips, getEffectiveDuration, getAudioEffDur),
    [internalClips, audioClips, getEffectiveDuration, getAudioEffDur],
  );

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

  if (internalClips.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-black">
        <EmptyEditorState />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
      {/* ── Tool Tab Bar ── */}
      <div className="flex items-center gap-1 px-3 h-12 border-b border-white/10 bg-black/20 backdrop-blur-md shrink-0 min-w-0 overflow-x-auto scrollbar-none">
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
                setInternalClips={setInternalClipsH}
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

        <PlayerView playerRef={playerRef} compositionProps={compositionProps} totalFrames={totalFrames} playbackRate={playbackRate} />

        <TransitionPickerPanel
          containerRef={videoPreviewRef}
          transitionPickerFor={transitionPickerFor}
          internalClips={internalClips}
          clipTransitions={clipTransitions}
          setClipTransitions={setClipTransitionsH}
          visible={transitionPickerFor !== null}
          setVisible={(visible) => setTransitionPickerFor(visible ? transitionPickerFor : null)}
        />
      </div>

      <Timeline
        tracks={tracks}
        totalDuration={totalDuration}
        currentFrame={Math.round(currentTime * FPS)}
        fps={FPS}
        onFrameChange={(frame) => seekTo(frame / FPS)}
        onTracksChange={onTracksChangeH}
        onItemMove={onItemMoveH}
        onItemResize={onItemResizeH}
        onItemSelect={(id) => setSelectedItemIds([id])}
        selectedItemIds={selectedItemIds}
        onSelectedItemsChange={setSelectedItemIds}
        onDeleteItems={onDeleteItemsH}
        onDuplicateItems={onDuplicateItemsH}
        onSplitItems={onSplitItemsH}
        onReverseItems={onReverseItemsH}
        onAddNewItem={onAddNewItemH}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
        trackLocks={trackLocks}
        onTrackLockToggle={onTrackLockToggleH}
        onTrackDelete={onTrackDeleteH}
        onTrackReorder={onTrackReorderH}
        onCollapsedChange={setTimelineCollapsed}
        isPlaying={isPlaying}
        onPlay={playH}
        onPause={pauseH}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        getRawDuration={getRawDuration}
        clipTransitions={clipTransitions}
        transitionPickerFor={transitionPickerFor}
        onTransitionPickerChange={setTransitionPickerFor}
        collapsed={timelineCollapsed}
      />
    </div>
  );
}
