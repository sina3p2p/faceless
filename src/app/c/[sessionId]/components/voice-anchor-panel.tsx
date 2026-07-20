import { useState } from "react";
import type { VoiceAnchor, VoiceGalleryItem } from "@/types/v2/story";

export function VoiceAnchorPanel({
  voiceAnchor,
  disabled,
  onApproveRemaining,
  onReject,
  onRetry,
}: {
  voiceAnchor: VoiceAnchor;
  disabled?: boolean;
  onApproveRemaining?: (
    approvals: Array<{ handle: string; candidateId: string; approvedUrl: string }>
  ) => void;
  onReject?: (handle: string, objection: string) => void;
  onRetry?: () => void;
}) {
  const [rejectingHandle, setRejectingHandle] = useState<string | null>(null);
  const [objection, setObjection] = useState("");

  if (voiceAnchor.loading && !voiceAnchor.items?.length) {
    return (
      <div className="mt-1 space-y-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (voiceAnchor.error && !voiceAnchor.items?.length) {
    return (
      <div className="mt-1 flex items-center gap-3">
        <p className="text-xs text-red-400">{voiceAnchor.error}</p>
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

  const items = voiceAnchor.items ?? [];
  const isLocked = !!voiceAnchor.approved;
  const pendingItems = items.filter((i) => i.loading);
  const actionable = items.filter((i) => !i.rejected && !i.error);
  const canApprove =
    !isLocked &&
    !disabled &&
    pendingItems.length === 0 &&
    actionable.length > 0 &&
    actionable.every((i) => !!i.url && !!i.id);

  function buildApprovals() {
    return actionable.map((item) => ({
      handle: item.handle,
      candidateId: item.id!,
      approvedUrl: item.url!,
    }));
  }

  return (
    <div className="mt-1 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary">Voice anchors</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="text-xs text-muted-foreground/60">
          {items.length} voice{items.length === 1 ? "" : "s"}
        </span>
        {isLocked && (
          <span className="text-[10px] uppercase tracking-wide text-emerald-400/80">Approved</span>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <VoiceRow
            key={item.handle}
            item={item}
            locked={isLocked}
            disabled={disabled}
            rejecting={rejectingHandle === item.handle}
            objection={rejectingHandle === item.handle ? objection : ""}
            onStartReject={() => {
              setRejectingHandle(item.handle);
              setObjection("");
            }}
            onCancelReject={() => {
              setRejectingHandle(null);
              setObjection("");
            }}
            onObjectionChange={setObjection}
            onConfirmReject={() => {
              if (!objection.trim() || !onReject) return;
              onReject(item.handle, objection.trim());
              setRejectingHandle(null);
              setObjection("");
            }}
          />
        ))}
      </div>

      {canApprove && onApproveRemaining && (
        <button
          onClick={() => onApproveRemaining(buildApprovals())}
          className="text-xs bg-primary/15 text-primary hover:bg-primary/25 border border-primary/30 rounded-lg px-3 py-1.5 transition-colors"
        >
          Approve voices
        </button>
      )}
    </div>
  );
}

function VoiceRow({
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
  item: VoiceGalleryItem;
  locked: boolean;
  disabled?: boolean;
  rejecting: boolean;
  objection: string;
  onStartReject: () => void;
  onCancelReject: () => void;
  onObjectionChange: (v: string) => void;
  onConfirmReject: () => void;
}) {
  if (item.loading) {
    return <div className="h-12 rounded-lg bg-white/5 animate-pulse" />;
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/3 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">@{item.handle}</p>
          {item.characterHandle && (
            <p className="text-[10px] text-muted-foreground/60 truncate">
              linked to @{item.characterHandle}
            </p>
          )}
        </div>
        {item.approvedUrl && (
          <span className="text-[10px] uppercase tracking-wide text-emerald-400/80 shrink-0">
            Bound
          </span>
        )}
        {item.rejected && (
          <span className="text-[10px] uppercase tracking-wide text-amber-400/80 shrink-0">
            Rejected
          </span>
        )}
      </div>

      {item.url && (
        <audio controls preload="none" src={item.url} className="w-full h-8" />
      )}

      {item.sampleText && (
        <p className="text-[11px] text-muted-foreground/70 line-clamp-2">{item.sampleText}</p>
      )}

      {item.error && <p className="text-xs text-red-400">{item.error}</p>}

      {!locked && !item.rejected && item.url && onStartReject && (
        rejecting ? (
          <div className="space-y-2">
            <textarea
              value={objection}
              onChange={(e) => onObjectionChange(e.target.value)}
              placeholder="What should change about this voice?"
              rows={2}
              className="w-full text-xs rounded-md bg-black/30 border border-white/10 px-2 py-1.5 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={onConfirmReject}
                disabled={disabled || !objection.trim()}
                className="text-xs text-amber-300 border border-amber-400/30 rounded-lg px-2.5 py-1 disabled:opacity-40"
              >
                Regenerate
              </button>
              <button
                onClick={onCancelReject}
                className="text-xs text-muted-foreground/60 px-2.5 py-1"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={onStartReject}
            disabled={disabled}
            className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground"
          >
            Reject & regenerate
          </button>
        )
      )}
    </div>
  );
}
