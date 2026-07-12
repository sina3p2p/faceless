import {
  AbsoluteFill,
  Html5Audio,
  OffthreadVideo,
  Sequence,
  getRemotionEnvironment,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/** Same-origin proxy so Player/prefetch can fetch bytes (R2 has no CORS). */
export function previewMediaUrl(url: string): string {
  return url.replace(/\/api\/media\//, "/api/media-proxy/");
}

function playerSrc(url: string): string {
  return getRemotionEnvironment().isPlayer ? previewMediaUrl(url) : url;
}

export type TransitionType =
  | "dissolve"
  | "fade-black"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "wipe-left"
  | "wipe-right";

export interface ClipConfig {
  id: string;
  videoUrl: string;
  startTime: number;       // absolute position on the NLE timeline (seconds)
  trackIndex: number;      // which track/row (0 = primary, renders on top)
  trimStart: number;
  trimEnd: number | null;
  rawDuration: number;
  speed: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  transition?: { type: TransitionType; duration: number };
}

export interface AudioClipConfig {
  id: string;
  url: string;
  startTime: number;
  trimStart: number;
  trimEnd: number | null;
  rawDuration: number;
  volume: number;
}

export interface StoryCompositionProps extends Record<string, unknown> {
  clips: ClipConfig[];
  audioClips?: AudioClipConfig[];
}

export const FPS = 30;

export function computeClipFrames(clip: ClipConfig): number {
  const raw = clip.rawDuration > 0 ? clip.rawDuration : 0;
  const end = clip.trimEnd ?? raw;
  const sourceLen = Math.max(0, end - clip.trimStart);
  return Math.max(1, Math.round((sourceLen / Math.max(0.1, clip.speed)) * FPS));
}

export function computeSequenceLayout(clips: ClipConfig[]) {
  const items = clips.map((clip) => {
    const frames = computeClipFrames(clip);
    const from = Math.round(clip.startTime * FPS);
    return {
      clip,
      from,
      frames,
      transInFrames: 0,
      transOutFrames: 0,
      transInType: undefined as TransitionType | undefined,
      transOutType: undefined as TransitionType | undefined,
    };
  });

  // Wire up transitions: for each clip that declares one, find the clip on the
  // same track that ends immediately before it and set the overlap windows.
  for (const item of items) {
    const { clip } = item;
    if (!clip.transition) continue;
    const transFrames = Math.round(clip.transition.duration * FPS);
    if (transFrames <= 0) continue;

    // Find the latest-ending clip on the same track that ends at or before this clip starts
    let prev: typeof items[number] | undefined;
    for (const other of items) {
      if (other === item) continue;
      if (other.clip.trackIndex !== clip.trackIndex) continue;
      if (other.from + other.frames <= item.from + transFrames) {
        if (!prev || other.from + other.frames > prev.from + prev.frames) {
          prev = other;
        }
      }
    }

    if (!prev) continue;

    item.transInFrames = transFrames;
    item.transInType = clip.transition.type;
    prev.transOutFrames = transFrames;
    prev.transOutType = clip.transition.type;
  }

  const totalFrames = Math.max(1, ...items.map(({ from, frames }) => from + frames));
  return { items, totalFrames };
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function ClipLayer({
  clip,
  totalFrames,
  transInFrames,
  transOutFrames,
  transInType,
  transOutType,
}: {
  clip: ClipConfig;
  totalFrames: number;
  transInFrames: number;
  transOutFrames: number;
  transInType: TransitionType | undefined;
  transOutType: TransitionType | undefined;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 0→1 progress values for the two transition windows
  const inP = transInFrames > 0 && frame < transInFrames
    ? ease(interpolate(frame, [0, transInFrames], [0, 1], { extrapolateRight: "clamp" }))
    : 1;
  const outP = transOutFrames > 0 && frame > totalFrames - transOutFrames
    ? ease(interpolate(frame, [totalFrames - transOutFrames, totalFrames], [0, 1], { extrapolateLeft: "clamp" }))
    : 0;

  let opacity = 1;
  let transform = "";
  let clipPath = "";
  let blackOpacity = 0;

  // ── Incoming transition ────────────────────────────────────────────────────
  if (inP < 1) {
    switch (transInType) {
      case "dissolve":
        opacity *= inP;
        break;
      case "fade-black":
        blackOpacity = Math.max(blackOpacity, 1 - inP);
        break;
      case "slide-left":
        transform = `translateX(${(1 - inP) * 100}%)`;
        break;
      case "slide-right":
        transform = `translateX(${-(1 - inP) * 100}%)`;
        break;
      case "slide-up":
        transform = `translateY(${(1 - inP) * 100}%)`;
        break;
      case "slide-down":
        transform = `translateY(${-(1 - inP) * 100}%)`;
        break;
      case "zoom-in":
        transform = `scale(${0.88 + 0.12 * inP})`;
        opacity *= inP;
        break;
      case "wipe-left":
        clipPath = `inset(0 ${(1 - inP) * 100}% 0 0)`;
        break;
      case "wipe-right":
        clipPath = `inset(0 0 0 ${(1 - inP) * 100}%)`;
        break;
    }
  }

  // ── Outgoing transition ────────────────────────────────────────────────────
  if (outP > 0) {
    switch (transOutType) {
      case "dissolve":
        opacity *= 1 - outP;
        break;
      case "fade-black":
        blackOpacity = Math.max(blackOpacity, outP);
        break;
      case "slide-left":
        transform = `translateX(${-outP * 100}%)`;
        break;
      case "slide-right":
        transform = `translateX(${outP * 100}%)`;
        break;
      case "slide-up":
        transform = `translateY(${-outP * 100}%)`;
        break;
      case "slide-down":
        transform = `translateY(${outP * 100}%)`;
        break;
      case "zoom-in":
        transform = `scale(${1 + 0.12 * outP})`;
        opacity *= 1 - outP;
        break;
      // wipe: incoming clip covers the outgoing one — no outgoing animation needed
    }
  }

  // ── Volume envelope ────────────────────────────────────────────────────────
  const volumeAtFrame = (f: number): number => {
    const fadeInF = Math.round(clip.fadeIn * fps);
    const fadeOutF = Math.round(clip.fadeOut * fps);
    let vol = clip.volume;
    if (fadeInF > 0 && f < fadeInF) {
      vol = interpolate(f, [0, fadeInF], [0, clip.volume], { extrapolateRight: "clamp" });
    } else if (fadeOutF > 0 && f > totalFrames - fadeOutF) {
      vol = interpolate(f, [totalFrames - fadeOutF, totalFrames], [clip.volume, 0], { extrapolateLeft: "clamp" });
    }
    return Math.max(0, vol);
  };

  const raw = clip.rawDuration > 0 ? clip.rawDuration : undefined;
  const trimBefore = Math.round(clip.trimStart * fps);
  const trimAfter =
    clip.trimEnd !== null && clip.trimEnd !== undefined
      ? Math.round(clip.trimEnd * fps)
      : raw !== undefined
      ? Math.round(raw * fps)
      : undefined;

  return (
    <AbsoluteFill style={{ opacity, transform: transform || undefined, clipPath: clipPath || undefined, overflow: "hidden" }}>
      <OffthreadVideo
        src={playerSrc(clip.videoUrl)}
        trimBefore={trimBefore}
        {...(trimAfter !== undefined ? { trimAfter } : {})}
        playbackRate={Math.max(0.1, clip.speed)}
        volume={volumeAtFrame}
        pauseWhenBuffering
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
      {blackOpacity > 0 && (
        <AbsoluteFill style={{ backgroundColor: "black", opacity: blackOpacity }} />
      )}
    </AbsoluteFill>
  );
}

export function StoryComposition({ clips, audioClips = [] }: StoryCompositionProps) {
  if (clips.length === 0 && audioClips.length === 0) {
    return <AbsoluteFill style={{ backgroundColor: "black" }} />;
  }

  const { items } = computeSequenceLayout(clips);
  const sorted = [...items].sort((a, b) => b.clip.trackIndex - a.clip.trackIndex);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {sorted.map(({ clip, from, frames, transInFrames, transOutFrames, transInType, transOutType }) => (
        // premountFor needs absolute-fill (layout="none" skips premount entirely).
        // 3s gives remote clips time to seek+buffer before the cut.
        <Sequence key={clip.id} from={from} durationInFrames={frames} premountFor={FPS * 3}>
          <ClipLayer
            clip={clip}
            totalFrames={frames}
            transInFrames={transInFrames}
            transOutFrames={transOutFrames}
            transInType={transInType}
            transOutType={transOutType}
          />
        </Sequence>
      ))}
      {audioClips.map((ac) => {
        const raw = ac.rawDuration > 0 ? ac.rawDuration : 0;
        const end = ac.trimEnd ?? raw;
        const sourceLen = Math.max(0, end - ac.trimStart);
        const durationFrames = Math.max(1, Math.round(sourceLen * FPS));
        const from = Math.round(ac.startTime * FPS);
        const trimBefore = Math.round(ac.trimStart * FPS);
        const trimAfter = Math.round(end * FPS);
        return (
          <Sequence key={ac.id} from={from} durationInFrames={durationFrames} premountFor={FPS * 3}>
            <Html5Audio src={playerSrc(ac.url)} trimBefore={trimBefore} trimAfter={trimAfter} volume={ac.volume} pauseWhenBuffering />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
