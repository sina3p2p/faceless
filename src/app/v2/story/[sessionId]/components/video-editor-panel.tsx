"use client";

import { useState, useRef, useEffect, useMemo } from "react";
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

export type Clip = {
  toolCallId: string;
  videoUrl: string;
  approved?: boolean;
};

type ToolTab = "edit" | "speed" | "volume" | "text" | "audio" | "effects" | "export";

interface VideoEditorPanelProps {
  clips: Clip[];
  onReorderClips: (newOrder: string[]) => void;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Sortable clip block in timeline ───────────────────────────────────────

function SortableClipBlock({
  clip,
  index,
  width,
  isSelected,
  isActive,
  duration,
  onClick,
}: {
  clip: Clip;
  index: number;
  width: number;
  isSelected: boolean;
  isActive: boolean;
  duration: number;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.toolCallId });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        width: Math.max(width, 40),
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`relative shrink-0 h-14 rounded-md border-2 cursor-pointer overflow-hidden select-none transition-all ${
        isSelected
          ? "border-violet-500 ring-2 ring-violet-500/30"
          : isActive
          ? "border-violet-400/60"
          : "border-white/10 hover:border-white/25"
      }`}
    >
      {/* gradient bg */}
      <div className="absolute inset-0 bg-gradient-to-br from-violet-900/50 to-indigo-950/80" />

      {/* video thumbnail via poster */}
      <video
        src={clip.videoUrl}
        className="absolute inset-0 w-full h-full object-cover opacity-60"
        preload="metadata"
        muted
      />

      {/* overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

      {/* clip number */}
      <span className="absolute top-1 left-1.5 text-[9px] font-bold text-white/80 bg-black/50 px-1 py-0.5 rounded">
        {index + 1}
      </span>

      {/* approved badge */}
      {clip.approved && (
        <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 flex items-center justify-center">
          <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
          </svg>
        </span>
      )}

      {/* duration */}
      {duration > 0 && (
        <span className="absolute bottom-1 right-1 text-[9px] font-mono text-white/70 bg-black/50 px-1 rounded">
          {duration.toFixed(1)}s
        </span>
      )}
    </div>
  );
}

// ─── Main Panel ─────────────────────────────────────────────────────────────

export function VideoEditorPanel({
  clips,
  onReorderClips,
  selectedClipId,
  onSelectClip,
}: VideoEditorPanelProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [clipMeta, setClipMeta] = useState<Map<string, number>>(new Map());
  const [pxPerSec, setPxPerSec] = useState(80);
  const [activeTab, setActiveTab] = useState<ToolTab>("edit");
  const [clipSpeeds, setClipSpeeds] = useState<Map<string, number>>(new Map());
  const [clipVolumes, setClipVolumes] = useState<Map<string, number>>(new Map());

  // Two video slots for gapless clip-to-clip transitions: one plays, one preloads
  const videoRefs = [useRef<HTMLVideoElement>(null), useRef<HTMLVideoElement>(null)] as const;
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  // Mirror activeSlot in a ref so closures (loadedmetadata, etc.) never see stale value
  const activeSlotRef = useRef<0 | 1>(0);
  activeSlotRef.current = activeSlot;

  const timelineRef = useRef<HTMLDivElement>(null);
  const isSeekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;
  const loadedUrlRef = useRef<string | null>(null);

  function getActiveVideo() { return videoRefs[activeSlotRef.current].current; }
  function getInactiveVideo() { return videoRefs[(1 - activeSlotRef.current) as 0 | 1].current; }

  // ── derived ──────────────────────────────────────────────────────────────

  const clipOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const c of clips) {
      offsets.push(acc);
      acc += clipMeta.get(c.toolCallId) ?? 0;
    }
    return offsets;
  }, [clips, clipMeta]);

  const totalDuration = useMemo(
    () => clips.reduce((sum, c) => sum + (clipMeta.get(c.toolCallId) ?? 0), 0),
    [clips, clipMeta]
  );

  // ── playback ─────────────────────────────────────────────────────────────

  // Load a clip into the video element. React guarantees ref is populated before effects run,
  // so videoRef.current is valid when this fires (the <video> element only renders when clips exist).
  function loadClip(clip: Clip, localTime: number, forcePlay?: boolean, into?: HTMLVideoElement | null) {
    const video = into ?? getActiveVideo();
    if (!video) return;
    // Only track loaded URL for the active slot
    if (!into) loadedUrlRef.current = clip.videoUrl;
    video.src = clip.videoUrl;
    video.playbackRate = clipSpeeds.get(clip.toolCallId) ?? 1;
    video.volume = clipVolumes.get(clip.toolCallId) ?? 1;
    video.load();
    const shouldPlay = forcePlay !== undefined ? forcePlay : isPlayingRef.current;
    video.addEventListener(
      "loadedmetadata",
      () => {
        video.currentTime = localTime > 0 ? localTime : 0.001;
        if (shouldPlay) video.play().catch(() => {});
      },
      { once: true }
    );
  }

  useEffect(() => {
    const clip = clips[activeClipIndex];
    const url = clip?.videoUrl ?? null;
    // Skip if already loaded — happens after a slot-swap in handleEnded
    if (loadedUrlRef.current === url) return;
    if (!clip) { loadedUrlRef.current = null; return; }
    const localTime = Math.max(0, currentTime - (clipOffsets[activeClipIndex] ?? 0));
    loadClip(clip, localTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipIndex, clips]);

  // Keep the inactive slot preloaded with the next clip so handleEnded can play it instantly
  useEffect(() => {
    const nextClip = clips[activeClipIndex + 1];
    const inactive = getInactiveVideo();
    if (!inactive || !nextClip) return;
    if (inactive.src !== nextClip.videoUrl) {
      inactive.muted = true; // silence until it becomes active
      inactive.src = nextClip.videoUrl;
      inactive.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClipIndex, clips, activeSlot]);

  function handleTimeUpdate() {
    const video = getActiveVideo();
    if (!video || isSeekingRef.current) return;
    setCurrentTime((clipOffsets[activeClipIndex] ?? 0) + video.currentTime);
  }

  function handleEnded() {
    const next = activeClipIndex + 1;
    if (next < clips.length) {
      const nextClip = clips[next]!;
      const nextSlot = (1 - activeSlotRef.current) as 0 | 1;
      const inactive = getInactiveVideo(); // already preloaded with next clip

      // Start the preloaded slot immediately — zero network wait
      if (inactive) {
        inactive.muted = false;
        inactive.volume = clipVolumes.get(nextClip.toolCallId) ?? 1;
        inactive.playbackRate = clipSpeeds.get(nextClip.toolCallId) ?? 1;
        const doPlay = () => { inactive.currentTime = 0.001; inactive.play().catch(() => {}); };
        if (inactive.readyState >= 1) doPlay();
        else inactive.addEventListener("loadedmetadata", doPlay, { once: true });
      }

      // Swap visible slot; preload effect will fill old active with clip[next+1]
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
    if (!video || clips.length === 0) return;
    if (isPlaying) {
      video.pause();
    } else {
      if (currentTime >= totalDuration && totalDuration > 0) {
        seekTo(0);
        return;
      }
      video.play().catch(() => {});
    }
  }

  function seekTo(t: number) {
    const clamped = Math.max(0, Math.min(totalDuration, t));
    let newIdx = 0;
    for (let i = clips.length - 1; i >= 0; i--) {
      if (clamped >= (clipOffsets[i] ?? 0)) { newIdx = i; break; }
    }
    isSeekingRef.current = true;
    setCurrentTime(clamped);
    const video = getActiveVideo();
    if (newIdx === activeClipIndex && video) {
      video.currentTime = clamped - (clipOffsets[newIdx] ?? 0);
    } else {
      setActiveClipIndex(newIdx);
    }
    setTimeout(() => { isSeekingRef.current = false; }, 50);
  }

  // ── transport shortcuts ───────────────────────────────────────────────────

  function goToStart() {
    setActiveClipIndex(0);
    setCurrentTime(0);
    const video = getActiveVideo();
    if (video) video.currentTime = 0;
  }

  function goToEnd() {
    seekTo(totalDuration);
  }

  function prevClip() {
    const idx = Math.max(0, activeClipIndex - 1);
    seekTo(clipOffsets[idx] ?? 0);
  }

  function nextClip() {
    const idx = Math.min(clips.length - 1, activeClipIndex + 1);
    seekTo(clipOffsets[idx] ?? 0);
  }

  // ── timeline interaction ──────────────────────────────────────────────────

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    // offset 48px for track label column
    seekTo((x - 48) / pxPerSec);
  }

  // ── dnd ──────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = clips.map((c) => c.toolCallId);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    onReorderClips(arrayMove(ids, oldIdx, newIdx));
  }

  // ── per-clip controls ─────────────────────────────────────────────────────

  const selectedClip = clips.find((c) => c.toolCallId === selectedClipId) ?? null;

  function setSpeed(rate: number) {
    if (!selectedClipId) return;
    setClipSpeeds((prev) => new Map(prev).set(selectedClipId, rate));
    if (selectedClipId === clips[activeClipIndex]?.toolCallId) {
      const v = getActiveVideo(); if (v) v.playbackRate = rate;
    }
  }

  function setVolume(vol: number) {
    if (!selectedClipId) return;
    setClipVolumes((prev) => new Map(prev).set(selectedClipId, vol));
    if (selectedClipId === clips[activeClipIndex]?.toolCallId) {
      const v = getActiveVideo(); if (v) v.volume = vol;
    }
  }

  // ── timeline ruler ────────────────────────────────────────────────────────

  const tickInterval = pxPerSec >= 60 ? 1 : pxPerSec >= 30 ? 2 : 5;
  const totalTicks = totalDuration > 0 ? Math.ceil(totalDuration / tickInterval) + 2 : 20;
  const timelineContentWidth = Math.max(totalDuration * pxPerSec + 96, 600);

  // ── tool tabs config ──────────────────────────────────────────────────────

  const TABS: { id: ToolTab; label: string; icon: React.ReactNode }[] = [
    {
      id: "edit",
      label: "Edit",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 13.5V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m12-3V3.75m0 9.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 3.75V16.5m-6-9V3.75m0 3.75a1.5 1.5 0 010 3m0-3a1.5 1.5 0 000 3m0 9.75V10.5" />
        </svg>
      ),
    },
    {
      id: "speed",
      label: "Speed",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
        </svg>
      ),
    },
    {
      id: "volume",
      label: "Volume",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
        </svg>
      ),
    },
    {
      id: "text",
      label: "Text",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
      ),
    },
    {
      id: "audio",
      label: "Audio",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
      ),
    },
    {
      id: "effects",
      label: "Effects",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
      ),
    },
    {
      id: "export",
      label: "Export",
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      ),
    },
  ];

  const currentSpeed = selectedClipId ? (clipSpeeds.get(selectedClipId) ?? 1) : 1;
  const currentVolume = selectedClipId ? (clipVolumes.get(selectedClipId) ?? 1) : 1;

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0f0f11] overflow-hidden">
      {/* Hidden metadata loaders */}
      {clips
        .filter((c) => !clipMeta.has(c.toolCallId))
        .map((c) => (
          <video
            key={c.toolCallId}
            src={c.videoUrl}
            className="hidden"
            preload="metadata"
            onLoadedMetadata={(e) => {
              const dur = (e.target as HTMLVideoElement).duration;
              setClipMeta((prev) => new Map(prev).set(c.toolCallId, isFinite(dur) ? dur : 0));
            }}
          />
        ))}

      {/* ── Tool Tab Bar ── */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/8 bg-[#16161a] shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              activeTab === tab.id
                ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tool Context Bar ── */}
      {activeTab !== "edit" && (
        <div className="shrink-0 px-4 py-2 border-b border-white/8 bg-[#13131a] flex items-center gap-3 min-h-[44px]">
          {activeTab === "speed" && (
            <>
              <span className="text-xs text-gray-500 mr-1">Speed</span>
              {[0.25, 0.5, 1, 1.5, 2].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setSpeed(rate)}
                  disabled={!selectedClipId}
                  className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    currentSpeed === rate
                      ? "bg-violet-600 text-white"
                      : "bg-white/8 text-gray-400 hover:bg-white/12 hover:text-white"
                  }`}
                >
                  {rate}×
                </button>
              ))}
              {!selectedClipId && (
                <span className="text-xs text-gray-600 ml-2">Select a clip to adjust speed</span>
              )}
            </>
          )}

          {activeTab === "volume" && (
            <>
              <span className="text-xs text-gray-500 mr-1">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={currentVolume}
                onChange={(e) => setVolume(Number(e.target.value))}
                disabled={!selectedClipId}
                className="w-32 accent-violet-500 disabled:opacity-30"
              />
              <span className="text-xs font-mono text-gray-400">
                {Math.round(currentVolume * 100)}%
              </span>
              {!selectedClipId && (
                <span className="text-xs text-gray-600 ml-2">Select a clip to adjust volume</span>
              )}
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
              {clips.length === 0 ? (
                <span className="text-xs text-gray-600">No clips to export yet</span>
              ) : (
                <>
                  <span className="text-xs text-gray-500">Download clips:</span>
                  {clips.map((clip, i) => (
                    <a
                      key={clip.toolCallId}
                      href={clip.videoUrl}
                      download={`shot-${i + 1}.mp4`}
                      className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-400/40 rounded px-2 py-1 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Shot {i + 1}
                    </a>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Video Preview ── */}
      <div
        className="flex-1 bg-black flex items-center justify-center min-h-0 relative"
        onClick={() => onSelectClip(null)}
      >
        {clips.length === 0 ? (
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
                    onPause={isActive ? (e) => {
                      // Don't treat natural clip-end as a user pause
                      if (!(e.target as HTMLVideoElement).ended) setIsPlaying(false);
                    } : undefined}
                    playsInline
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* time overlay on preview */}
        {clips.length > 0 && (
          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
            <span className="text-xs font-mono text-white/70">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>
        )}
      </div>

      {/* ── Transport Controls ── */}
      <div className="shrink-0 h-11 flex items-center justify-between px-4 border-t border-white/8 bg-[#16161a]">
        {/* transport buttons */}
        <div className="flex items-center gap-1">
          {/* go to start */}
          <button
            onClick={goToStart}
            disabled={clips.length === 0}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/8 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            title="Go to start"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>
          {/* prev clip */}
          <button
            onClick={prevClip}
            disabled={clips.length === 0}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/8 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            title="Previous clip"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm12 12L8 12l10-6z" />
            </svg>
          </button>
          {/* play/pause */}
          <button
            onClick={togglePlay}
            disabled={clips.length === 0}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-25 disabled:cursor-not-allowed shadow-md"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {/* next clip */}
          <button
            onClick={nextClip}
            disabled={clips.length === 0}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/8 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            title="Next clip"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l10-6L6 6v12zm12-12v12h2V6h-2z" />
            </svg>
          </button>
          {/* go to end */}
          <button
            onClick={goToEnd}
            disabled={clips.length === 0}
            className="w-8 h-8 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/8 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
            title="Go to end"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l10-6L6 6v12zm12-12v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* time display */}
        <span className="text-xs font-mono text-gray-500 tabular-nums">
          {formatTime(currentTime)}
          <span className="text-gray-700 mx-1">/</span>
          {formatTime(totalDuration)}
        </span>

        {/* zoom */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-700 font-mono">{pxPerSec}px/s</span>
          <button
            onClick={() => setPxPerSec((p) => Math.max(20, p - 20))}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/8 transition-all text-lg leading-none"
          >
            −
          </button>
          <button
            onClick={() => setPxPerSec((p) => Math.min(200, p + 20))}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/8 transition-all text-lg leading-none"
          >
            +
          </button>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="shrink-0 h-[188px] border-t border-white/8 bg-[#0d0d10] flex flex-col">
        {/* timeline scroll container */}
        <div
          ref={timelineRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onClick={handleTimelineClick}
          style={{ scrollbarWidth: "thin", scrollbarColor: "#333 transparent" }}
        >
          <div className="relative h-full" style={{ width: timelineContentWidth, minWidth: "100%" }}>
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-violet-400 z-20 pointer-events-none"
              style={{ left: 48 + currentTime * pxPerSec }}
            >
              {/* playhead triangle head */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-violet-400" />
            </div>

            {/* ── Ruler ── */}
            <div className="absolute top-0 left-0 right-0 h-6 border-b border-white/8 bg-[#111115]">
              <div className="absolute inset-0" style={{ left: 48 }}>
                {Array.from({ length: totalTicks }, (_, i) => {
                  const t = i * tickInterval;
                  const x = t * pxPerSec;
                  const isMajor = t % (tickInterval * 2) === 0;
                  return (
                    <div
                      key={t}
                      className="absolute top-0 flex flex-col items-start"
                      style={{ left: x }}
                    >
                      <div
                        className={`w-px ${isMajor ? "h-3 bg-white/20" : "h-1.5 bg-white/10"}`}
                      />
                      {isMajor && (
                        <span className="text-[9px] text-gray-700 ml-1 select-none mt-0.5">
                          {formatTime(t)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Video Track ── */}
            <div className="absolute left-0 right-0 flex items-center" style={{ top: 24 }}>
              {/* label */}
              <div className="w-12 shrink-0 flex flex-col items-center justify-center h-[72px] border-r border-white/8">
                <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <span className="text-[8px] text-gray-700 mt-0.5">VIDEO</span>
              </div>

              {/* clips track */}
              <div className="flex-1 h-[72px] relative flex items-center py-1 px-1 gap-1 overflow-visible">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={clips.map((c) => c.toolCallId)}
                    strategy={horizontalListSortingStrategy}
                  >
                    <div className="flex gap-1 h-full items-center">
                      {clips.map((clip, i) => (
                        <SortableClipBlock
                          key={clip.toolCallId}
                          clip={clip}
                          index={i}
                          width={(clipMeta.get(clip.toolCallId) ?? 4) * pxPerSec}
                          isSelected={clip.toolCallId === selectedClipId}
                          isActive={i === activeClipIndex}
                          duration={clipMeta.get(clip.toolCallId) ?? 0}
                          onClick={() => onSelectClip(clip.toolCallId)}
                        />
                      ))}
                      {clips.length === 0 && (
                        <div className="flex-1 h-14 rounded border border-dashed border-white/10 flex items-center justify-center">
                          <span className="text-[10px] text-gray-700">No clips</span>
                        </div>
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            </div>

            {/* ── Audio Track ── */}
            <div className="absolute left-0 right-0 flex items-center" style={{ top: 24 + 72 + 4 }}>
              {/* label */}
              <div className="w-12 shrink-0 flex flex-col items-center justify-center h-[52px] border-r border-white/8">
                <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
                </svg>
                <span className="text-[8px] text-gray-700 mt-0.5">AUDIO</span>
              </div>

              {/* audio wave visualization stub */}
              <div className="flex-1 h-[52px] py-2 px-1 flex items-center gap-1">
                {clips.map((clip, i) => {
                  const dur = clipMeta.get(clip.toolCallId) ?? 0;
                  const w = Math.max(dur * pxPerSec - 4, 36);
                  return (
                    <div
                      key={clip.toolCallId}
                      className={`h-8 rounded shrink-0 overflow-hidden relative ${
                        i === activeClipIndex ? "opacity-100" : "opacity-50"
                      }`}
                      style={{ width: w }}
                    >
                      {/* waveform-style gradient bars */}
                      <div className="absolute inset-0 bg-linear-to-r from-indigo-900/60 via-violet-800/50 to-indigo-900/60 rounded" />
                      <div className="absolute inset-x-0 inset-y-1 flex items-center gap-px px-1">
                        {Array.from({ length: Math.max(Math.floor(w / 4), 4) }, (_, j) => {
                          const h = 20 + Math.sin(j * 0.8 + i) * 14 + Math.sin(j * 1.7) * 8;
                          return (
                            <div
                              key={j}
                              className="flex-1 bg-violet-400/50 rounded-full"
                              style={{ height: `${Math.max(h, 8)}%` }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {clips.length === 0 && (
                  <div className="flex-1 h-8 rounded border border-dashed border-white/8" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* timeline footer: clip info */}
        <div className="h-7 shrink-0 border-t border-white/8 flex items-center px-3 gap-4">
          <span className="text-[10px] text-gray-700">
            {clips.length} {clips.length === 1 ? "clip" : "clips"}
            {totalDuration > 0 && ` · ${formatTime(totalDuration)} total`}
          </span>
          {selectedClip && (
            <span className="text-[10px] text-violet-500">
              Selected: Shot {clips.findIndex((c) => c.toolCallId === selectedClipId) + 1}
              {selectedClip.approved && " · Approved"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
