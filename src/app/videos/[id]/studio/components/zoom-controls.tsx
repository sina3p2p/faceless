"use client";

export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetView,
}: {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetView: () => void;
}) {
  const pct = Math.round(zoom * 100);

  return (
    <div className="absolute bottom-6 left-4 z-20 flex items-center rounded-xl bg-black/80 border border-white/10 backdrop-blur-sm shadow-lg overflow-hidden">
      <button
        onClick={onZoomOut}
        className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        title="Zoom out"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
        </svg>
      </button>

      <button
        onClick={onResetView}
        className="h-8 px-1.5 text-[11px] font-mono text-gray-400 hover:text-white transition-colors min-w-[44px] text-center"
        title="Reset to 100%"
      >
        {pct}%
      </button>

      <button
        onClick={onZoomIn}
        className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        title="Zoom in"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <div className="w-px h-5 bg-white/10" />

      <button
        onClick={onFitView}
        className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        title="Fit to view"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      </button>
    </div>
  );
}
