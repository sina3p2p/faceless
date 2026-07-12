import type { ContinuityPack } from "@/types/v2/story";

const ASPECT: Record<NonNullable<ContinuityPack["aspectRatio"]>, string> = {
  "16:9": "16/9",
  "9:16": "9/16",
  "1:1": "1/1",
};

export function ContinuityPackPanel({
  continuityPack,
  disabled,
  onApprove,
  onRetry,
}: {
  continuityPack: ContinuityPack;
  disabled?: boolean;
  onApprove?: (urls: string[]) => void;
  onRetry?: () => void;
}) {
  const aspect = ASPECT[continuityPack.aspectRatio ?? "16:9"];

  if (continuityPack.loading) {
    return (
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg bg-white/5 animate-pulse" style={{ aspectRatio: aspect }} />
        ))}
      </div>
    );
  }

  if (continuityPack.error || !continuityPack.images?.length) {
    return (
      <div className="mt-1 flex items-center gap-3">
        <p className="text-xs text-red-400">
          {continuityPack.error ?? "Continuity pack generation failed."}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={disabled}
            className="text-xs text-primary hover:text-primary border border-primary/30 hover:border-primary/50 rounded-lg px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  const isLocked = !!continuityPack.approvedUrls?.length;
  const notes = continuityPack.notes;
  const keyframes = continuityPack.keyframes ?? [];
  const images = continuityPack.images;

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary">
          {continuityPack.packHandle ?? `Scene ${continuityPack.sceneId} continuity`}
        </span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground/60">continuity pack</span>
        {isLocked && (
          <span className="ml-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            Approved
          </span>
        )}
      </div>

      {notes && (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 space-y-1">
          <p className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider">
            Notes
          </p>
          {(
            [
              ["Geography", notes.roomGeography],
              ["Blocking", notes.characterBlocking],
              ["Camera axis", notes.cameraAxis],
              ["Lighting", notes.lightingProgression],
              ["Screen dir.", notes.screenDirection],
              ["Fixed props", notes.fixedProps],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <p key={label} className="text-[10px] text-foreground/75 leading-snug">
                <span className="text-muted-foreground/55">{label}: </span>
                {value}
              </p>
            ) : null
          )}
        </div>
      )}

      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, minmax(0, 1fr))` }}
      >
        {images.map((url, i) => (
          <div key={url} className="space-y-1 min-w-0">
            <div
              className="rounded-lg overflow-hidden border border-white/10"
              style={{ aspectRatio: aspect }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={keyframes[i]?.caption ?? `Continuity keyframe ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            <p className="text-[9px] font-medium text-muted-foreground/50 uppercase tracking-wider">
              {keyframes[i]?.role ?? `Keyframe ${i + 1}`}
            </p>
            {keyframes[i]?.caption && (
              <p className="text-[10px] text-foreground/80 leading-snug line-clamp-2">
                {keyframes[i].caption}
              </p>
            )}
          </div>
        ))}
      </div>

      {!isLocked && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onApprove?.(images)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                clipRule="evenodd"
              />
            </svg>
            Approve continuity pack
          </button>
          {onRetry && (
            <button
              onClick={onRetry}
              disabled={disabled}
              className="text-xs text-muted-foreground/60 hover:text-muted-foreground border border-white/10 hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  );
}
