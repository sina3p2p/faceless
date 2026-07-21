import { PhotoProvider, PhotoView } from "react-photo-view";
import { useState } from "react";
import type { AssetGalleryItem, AssetRef } from "@/types/v2/story";

export function AssetRefPanel({
  assetRef,
  disabled,
  onApproveRemaining,
  onReject,
  onRetry,
}: {
  assetRef: AssetRef;
  disabled?: boolean;
  onApproveRemaining?: (
    approvals: Array<{ assetHandle: string; candidateId: string; approvedUrl: string }>
  ) => void;
  onReject?: (assetHandle: string, objection: string) => void;
  onRetry?: () => void;
}) {
  const [rejectingHandle, setRejectingHandle] = useState<string | null>(null);
  const [objection, setObjection] = useState("");

  if (assetRef.loading && !assetRef.items?.length) {
    return (
      <div className="mt-1 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-square rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (assetRef.error && !assetRef.items?.length) {
    return (
      <div className="mt-1 flex items-center gap-3">
        <p className="text-xs text-red-400">{assetRef.error}</p>
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

  const items = assetRef.items ?? [];
  const isLocked = !!assetRef.approved;
  const pendingItems = items.filter((i) => i.loading);
  const actionable = items.filter((i) => !i.rejected && !i.error);
  const canApprove =
    !isLocked &&
    !disabled &&
    pendingItems.length === 0 &&
    actionable.length > 0 &&
    actionable.every((i) => (i.candidates?.length ?? 0) > 0);

  function buildApprovals() {
    return actionable.map((item) => {
      const candidate = item.candidates![0]!;
      return {
        assetHandle: item.assetHandle,
        candidateId: candidate.id,
        approvedUrl: candidate.url,
      };
    });
  }

  return (
    <div className="mt-1 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary">Asset gallery</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground/60">
          {items.length} asset{items.length === 1 ? "" : "s"}
        </span>
        {isLocked && (
          <span className="ml-1 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            Approved
          </span>
        )}
      </div>

      <PhotoProvider>
        <div className="space-y-3">
          {items.map((item) => (
            <GalleryItem
              key={item.assetHandle}
              item={item}
              locked={isLocked}
              disabled={disabled}
              rejecting={rejectingHandle === item.assetHandle}
              objection={rejectingHandle === item.assetHandle ? objection : ""}
              onStartReject={() => {
                setRejectingHandle(item.assetHandle);
                setObjection("");
              }}
              onCancelReject={() => {
                setRejectingHandle(null);
                setObjection("");
              }}
              onObjectionChange={setObjection}
              onConfirmReject={() => {
                const text = objection.trim();
                if (!text || !onReject) return;
                onReject(item.assetHandle, text);
                setRejectingHandle(null);
                setObjection("");
              }}
            />
          ))}
        </div>
      </PhotoProvider>

      {!isLocked && (
        <div className="flex flex-wrap items-center gap-2">
          {onApproveRemaining && (
            <button
              type="button"
              disabled={!canApprove}
              onClick={() => onApproveRemaining(buildApprovals())}
              className="text-xs font-medium text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 bg-black/40 hover:bg-black/60 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Approve remaining
            </button>
          )}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={disabled}
              className="text-xs text-primary border border-primary/30 hover:border-primary/50 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Retry gallery
            </button>
          )}
          <p className="text-xs text-muted-foreground/40 w-full">
            Reject individuals with an objection (they regenerate). Approve remaining locks images and voices.
          </p>
        </div>
      )}
    </div>
  );
}

function GalleryItem({
  item,
  locked,
  disabled,
  rejecting,
  objection,
  onStartReject,
  onCancelReject,
  onObjectionChange,
  onConfirmReject,
}: {
  item: AssetGalleryItem;
  locked: boolean;
  disabled?: boolean;
  rejecting: boolean;
  objection: string;
  onStartReject: () => void;
  onCancelReject: () => void;
  onObjectionChange: (v: string) => void;
  onConfirmReject: () => void;
}) {
  const approved =
    locked && item.approvedUrl
      ? item.approvedUrl
      : item.approvedCandidateId
        ? item.candidates?.find((c) => c.id === item.approvedCandidateId)?.url
        : undefined;

  return (
    <div className="space-y-1.5 rounded-lg border border-white/10 p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary">{item.assetHandle}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground/60 capitalize">{item.assetKind}</span>
        {item.rejected && (
          <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
            Regenerating
          </span>
        )}
        {approved && (
          <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            Bound
          </span>
        )}
      </div>

      {item.loading ? (
        item.assetKind === "voice" ? (
          <div className="h-12 max-w-md rounded-lg bg-white/5 animate-pulse" />
        ) : (
          <div className="aspect-square max-w-[140px] rounded-lg bg-white/5 animate-pulse" />
        )
      ) : item.error ? (
        <p className="text-xs text-red-400">{item.error}</p>
      ) : item.assetKind === "voice" ? (
        <div className="space-y-1.5">
          {(item.candidates ?? []).map((c) => {
            const isApproved = c.url === approved || c.id === item.approvedCandidateId;
            return (
              <div
                key={c.id}
                className={`rounded-lg border p-2 transition-all ${
                  isApproved
                    ? "border-emerald-500 ring-2 ring-emerald-500/30"
                    : locked
                      ? "border-white/10 opacity-60"
                      : "border-white/10"
                }`}
              >
                <audio controls preload="none" src={c.url} className="w-full h-8" />
                {item.sampleText && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground/70 line-clamp-2">
                    {item.sampleText}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {(item.candidates ?? []).map((c) => {
            const isApproved = c.url === approved || c.id === item.approvedCandidateId;
            return (
              <div
                key={c.id}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                  isApproved
                    ? "border-emerald-500 ring-2 ring-emerald-500/30"
                    : locked
                      ? "border-white/10 opacity-60"
                      : "border-white/10"
                }`}
              >
                <PhotoView src={c.url}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.url}
                    alt={`${item.assetHandle} candidate`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                </PhotoView>
                {isApproved && (
                  <div className="pointer-events-none absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                    <svg className="w-6 h-6 text-emerald-400 drop-shadow" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!locked && !item.loading && !rejecting && (
        <button
          type="button"
          disabled={disabled}
          onClick={onStartReject}
          className="text-[10px] text-amber-300/80 hover:text-amber-200 border border-amber-400/20 hover:border-amber-300/40 rounded-md px-2 py-1 transition-colors disabled:opacity-40"
        >
          Reject…
        </button>
      )}

      {rejecting && (
        <div className="space-y-1.5">
          <textarea
            value={objection}
            onChange={(e) => onObjectionChange(e.target.value)}
            placeholder="What's wrong? (folded into the regen prompt)"
            rows={2}
            className="w-full text-xs rounded-md bg-black/40 border border-white/10 px-2 py-1.5 text-foreground placeholder:text-muted-foreground/40"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled || !objection.trim()}
              onClick={onConfirmReject}
              className="text-[10px] text-amber-200 border border-amber-400/30 rounded-md px-2 py-1 disabled:opacity-40"
            >
              Reject & regenerate
            </button>
            <button
              type="button"
              onClick={onCancelReject}
              className="text-[10px] text-muted-foreground border border-white/10 rounded-md px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
