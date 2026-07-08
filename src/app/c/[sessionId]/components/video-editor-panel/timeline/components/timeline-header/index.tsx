"use client";

import { useState } from "react";
import { MediaPickerDialog, type MediaItem as LibraryMediaItem } from "@/components/ui/media-picker-dialog";
import { useTimelineStore } from "../../stores/use-timeline-store";
import { useZoomStore } from "../../stores/use-zoom-store";
import { formatTime } from "../../../use-pointer-drag";
import { HEADER_H, MAX_PX_PER_SEC, MIN_PX_PER_SEC } from "../../constants";

const SPEEDS = [0.5, 1, 1.5, 2];

const iconBtn =
  "w-8 h-8 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground hover:bg-white/10 transition-all disabled:opacity-25 disabled:cursor-not-allowed";

export function TimelineHeader({ totalDuration, collapsed }: { totalDuration: number; collapsed: boolean }) {
  const tracks = useTimelineStore((s) => s.tracks);
  const selectedItemIds = useTimelineStore((s) => s.selectedItemIds);
  const onAddNewItem = useTimelineStore((s) => s.onAddNewItem);
  const canUndo = useTimelineStore((s) => s.canUndo);
  const canRedo = useTimelineStore((s) => s.canRedo);
  const onUndo = useTimelineStore((s) => s.onUndo);
  const onRedo = useTimelineStore((s) => s.onRedo);
  const onDeleteItems = useTimelineStore((s) => s.onDeleteItems);
  const onDuplicateItems = useTimelineStore((s) => s.onDuplicateItems);
  const onReverseItems = useTimelineStore((s) => s.onReverseItems);
  const onSplitItems = useTimelineStore((s) => s.onSplitItems);
  const currentFrame = useTimelineStore((s) => s.currentFrame);
  const fps = useTimelineStore((s) => s.fps);
  const onFrameChange = useTimelineStore((s) => s.onFrameChange);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const onPlay = useTimelineStore((s) => s.onPlay);
  const onPause = useTimelineStore((s) => s.onPause);
  const playbackRate = useTimelineStore((s) => s.playbackRate);
  const setPlaybackRate = useTimelineStore((s) => s.setPlaybackRate);
  const onCollapsedChange = useTimelineStore((s) => s.onCollapsedChange);
  const pxPerSec = useZoomStore((s) => s.pxPerSec);
  const setPxPerSec = useZoomStore((s) => s.setPxPerSec);

  const [videoPickerOpen, setVideoPickerOpen] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);

  const allItems = tracks.flatMap((t) => t.items);
  const videoItems = allItems.filter((it) => it.type === "video");
  const currentTime = currentFrame / fps;
  const selectedVideoItem =
    selectedItemIds.length === 1 ? videoItems.find((it) => it.id === selectedItemIds[0]) : undefined;
  const canSplit = selectedVideoItem
    ? currentTime - selectedVideoItem.start > 0.1 && selectedVideoItem.end - currentTime > 0.1
    : false;
  const hasSelection = selectedItemIds.length > 0;

  function goToStart() {
    onFrameChange(0);
  }
  function goToEnd() {
    onFrameChange(Math.round(totalDuration * fps));
  }
  function prevClip() {
    const starts = allItems.map((it) => it.start).sort((a, b) => a - b);
    const before = starts.filter((s) => s < currentTime - 0.05);
    onFrameChange(Math.round((before.length > 0 ? before[before.length - 1]! : 0) * fps));
  }
  function nextClip() {
    const starts = allItems.map((it) => it.start).sort((a, b) => a - b);
    const after = starts.find((s) => s > currentTime + 0.05);
    if (after !== undefined) onFrameChange(Math.round(after * fps));
  }
  function cycleSpeed() {
    const idx = SPEEDS.indexOf(playbackRate);
    setPlaybackRate(SPEEDS[(idx + 1) % SPEEDS.length] ?? 1);
  }

  function handleVideoSelect(item: LibraryMediaItem) {
    onAddNewItem({ type: "video", videoUrl: item.url, id: item.id, duration: item.duration ?? undefined });
  }

  function handleAudioSelect(item: LibraryMediaItem) {
    // Library items already carry a probed duration — only fall back to a
    // client-side <audio> probe (e.g. a stale library entry from before
    // that was tracked) if it's missing.
    if (item.duration != null) {
      onAddNewItem({ type: "audio", url: item.url, name: item.prompt ?? "audio", rawDuration: item.duration });
      return;
    }
    const el = new window.Audio();
    el.src = item.url;
    el.addEventListener(
      "loadedmetadata",
      () => {
        const dur = isFinite(el.duration) ? el.duration : 0;
        onAddNewItem({ type: "audio", url: item.url, name: item.prompt ?? "audio", rawDuration: dur });
      },
      { once: true },
    );
  }

  return (
    <>
      <div
        className="shrink-0 border-b border-white/8 flex items-center gap-1 px-2 overflow-x-auto bg-black/20"
        style={{ height: HEADER_H }}
      >
        {/* Undo / redo */}
        <button onClick={onUndo} disabled={!canUndo} title="Undo (Cmd+Z)" className={iconBtn}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)" className={iconBtn}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 15 6-6m0 0-6-6m6 6H9a6 6 0 0 0 0 12h3" />
          </svg>
        </button>

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Edit actions */}
        <button
          onClick={() => selectedVideoItem && onSplitItems(selectedVideoItem.id, currentTime)}
          disabled={!canSplit}
          title="Split at playhead"
          className={iconBtn}
        >
          <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m7.848 8.25 1.536.887M7.848 8.25a3 3 0 1 1-5.196-3 3 3 0 0 1 5.196 3Zm1.536.887a2.165 2.165 0 0 1 1.083 1.839c.005.351.054.695.14 1.024M9.384 9.137l2.077 1.199M7.848 15.75l1.536-.887m-1.536.887a3 3 0 1 1-5.196 3 3 3 0 0 1 5.196-3Zm1.536-.887a2.165 2.165 0 0 0 1.083-1.839c.005-.351.054-.695.14-1.024m0 0 2.077-1.199m0-3.328a4.323 4.323 0 0 1 2.068-1.379l5.325-1.628a4.5 4.5 0 0 1 2.48-.044l.803.215-7.794 4.5m-2.882-1.664A4.33 4.33 0 0 0 10.607 12m3.736 0 7.794 4.5-.802.215a4.5 4.5 0 0 1-2.48-.043l-5.326-1.629a4.324 4.324 0 0 1-2.068-1.379M14.343 12l-2.882 1.664" />
          </svg>
        </button>
        <button onClick={() => onDeleteItems(selectedItemIds)} disabled={!hasSelection} title="Delete selection" className={iconBtn}>
          <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
        <button onClick={() => onDuplicateItems(selectedItemIds)} disabled={!hasSelection} title="Duplicate selection" className={iconBtn}>
          <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
          </svg>
        </button>
        <button
          onClick={() => onReverseItems(selectedItemIds)}
          disabled={!hasSelection}
          title="Reverse selection"
          className={`w-8 h-8 flex items-center justify-center rounded transition-all disabled:opacity-25 disabled:cursor-not-allowed ${selectedVideoItem?.clip.reversed ? "text-amber-400 bg-amber-500/15 hover:bg-amber-500/25" : "text-muted-foreground/60 hover:text-foreground hover:bg-white/10"
            }`}
        >
          <svg className="w-[15px] h-[15px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          title="Playback speed"
          className="h-7 px-2 rounded text-[11px] font-mono font-semibold text-muted-foreground/70 hover:text-foreground hover:bg-white/10 transition-all"
        >
          {playbackRate}x
        </button>

        <div className="flex-1 flex items-center justify-center gap-1 min-w-fit">
          <button onClick={goToStart} disabled={allItems.length === 0} title="Go to start" className={iconBtn}>
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" /></svg>
          </button>
          <button onClick={prevClip} disabled={allItems.length === 0} title="Previous clip" className={iconBtn}>
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm12 12L8 12l10-6z" /></svg>
          </button>
          <button onClick={isPlaying ? onPause : onPlay} disabled={allItems.length === 0} title={isPlaying ? "Pause" : "Play"}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-black hover:bg-white transition-all disabled:opacity-25 disabled:cursor-not-allowed">
            {isPlaying
              ? <svg className="w-[15px] h-[15px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
              : <svg className="w-[15px] h-[15px] ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            }
          </button>
          <button onClick={nextClip} disabled={allItems.length === 0} title="Next clip" className={iconBtn}>
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l10-6L6 6v12zm12-12v12h2V6h-2z" /></svg>
          </button>
          <button onClick={goToEnd} disabled={allItems.length === 0} title="Go to end" className={iconBtn}>
            <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm8.5 0h2V6h-2v12z" /></svg>
          </button>
          <span className="text-[11px] font-mono text-muted-foreground/70 ml-1 whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        {/* Zoom */}
        <button onClick={() => setPxPerSec((p) => p * 0.8)} title="Zoom out"
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M8 11h6" />
          </svg>
        </button>
        <input
          type="range" min={MIN_PX_PER_SEC} max={MAX_PX_PER_SEC} value={pxPerSec}
          onChange={(e) => setPxPerSec(Number(e.target.value))}
          className="w-20 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white/70 hover:[&::-webkit-slider-thumb]:bg-white"
        />
        <button onClick={() => setPxPerSec((p) => p * 1.25)} title="Zoom in"
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
          </svg>
        </button>

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Add media */}
        <button
          onClick={() => setVideoPickerOpen(true)}
          title="Add video"
          className="flex items-center gap-1 h-7 px-2 rounded text-[11px] text-primary hover:bg-primary/10 border border-primary/20 hover:border-primary/50 transition-all"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Video
        </button>
        <button
          onClick={() => setAudioPickerOpen(true)}
          title="Add audio"
          className="flex items-center gap-1 h-7 px-2 rounded text-[11px] text-teal-500 hover:text-teal-300 hover:bg-teal-500/10 border border-teal-800/50 hover:border-teal-600/50 transition-all"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Audio
        </button>

        <div className="w-px h-5 bg-white/10 mx-1" />

        {/* Collapse */}
        <button
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "Expand timeline" : "Collapse timeline"}
          className="w-7 h-7 flex items-center justify-center rounded text-muted-foreground/60 hover:text-foreground transition-all shrink-0"
        >
          <svg
            className="w-4 h-4 transition-transform duration-200"
            style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      <MediaPickerDialog open={videoPickerOpen} onOpenChange={setVideoPickerOpen} accept={["video"]} title="Add Video" onSelect={handleVideoSelect} />
      <MediaPickerDialog open={audioPickerOpen} onOpenChange={setAudioPickerOpen} accept={["audio"]} title="Add Audio" onSelect={handleAudioSelect} />
    </>
  );
}
