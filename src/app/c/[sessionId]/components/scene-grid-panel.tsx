import type { SceneGrid } from "@/types/v2/story";

const ASPECT: Record<NonNullable<SceneGrid["aspectRatio"]>, string> = {
  "16:9": "16/9",
  "9:16": "9/16",
  "1:1": "1/1",
};

export function SceneGridPanel({
  sceneGrid,
  disabled,
  onApprove,
  onRetry,
}: {
  sceneGrid: SceneGrid;
  disabled?: boolean;
  onApprove?: (url: string) => void;
  onRetry?: () => void;
}) {
  const aspect = ASPECT[sceneGrid.aspectRatio ?? "16:9"];

  if (sceneGrid.loading) {
    return (
      <div className="mt-1 rounded-xl bg-white/5 animate-pulse" style={{ aspectRatio: aspect }} />
    );
  }

  const image = sceneGrid.images?.[0];
  if (sceneGrid.error || !image) {
    return (
      <div className="mt-1 flex items-center gap-3">
        <p className="text-xs text-red-400">{sceneGrid.error ?? "Grid generation failed."}</p>
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

  const isLocked = !!sceneGrid.approvedUrl;

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary">Scene {sceneGrid.sceneId} grid</span>
        {isLocked && (
          <span className="ml-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            Approved
          </span>
        )}
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10" style={{ aspectRatio: aspect }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={`Scene ${sceneGrid.sceneId} grid storyboard`}
          className="w-full h-full object-cover blur-sm transition-[filter] duration-500"
          onLoad={(e) => e.currentTarget.classList.remove("blur-sm")}
        />
      </div>

      {!isLocked && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onApprove?.(image)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
            Approve grid
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
