import { PhotoProvider, PhotoView } from "react-photo-view";
import type { AssetRef } from "@/types/v2/story";

export function AssetRefPanel({
  assetRef,
  disabled,
  onApprove,
  onRetry,
}: {
  assetRef: AssetRef;
  disabled?: boolean;
  onApprove?: (url: string) => void;
  onRetry?: () => void;
}) {
  if (assetRef.loading) {
    return (
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (assetRef.error || !assetRef.images?.length) {
    return (
      <div className="mt-1 flex items-center gap-3">
        <p className="text-xs text-red-400">{assetRef.error ?? "Image generation failed."}</p>
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

  const isLocked = !!assetRef.approvedUrl;

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary">{assetRef.assetHandle}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground/60 capitalize">{assetRef.assetKind}</span>
        {isLocked && (
          <span className="ml-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            Approved
          </span>
        )}
      </div>

      <PhotoProvider>
        <div className="grid grid-cols-3 gap-1.5">
          {(assetRef.images ?? []).map((url) => {
            const isApproved = url === assetRef.approvedUrl;
            return (
              <div
                key={url}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 ${isApproved
                  ? "border-emerald-500 ring-2 ring-emerald-500/30"
                  : isLocked
                    ? "border-white/10 opacity-60"
                    : "border-white/10"
                  }`}
              >
                <PhotoView src={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Reference candidate"
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                </PhotoView>
                {isApproved && (
                  <div className="pointer-events-none absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-400 drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
                {!isLocked && onApprove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) onApprove(url);
                    }}
                    disabled={disabled}
                    className="absolute bottom-1.5 right-1.5 z-10 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-1 text-[10px] font-medium text-emerald-300 border border-emerald-400/30 hover:bg-black/85 hover:border-emerald-300/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                    Approve
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </PhotoProvider>

      {!isLocked && (
        <p className="text-xs text-muted-foreground/40">Click an image to preview · Approve to lock the reference.</p>
      )}
    </div>
  );
}
