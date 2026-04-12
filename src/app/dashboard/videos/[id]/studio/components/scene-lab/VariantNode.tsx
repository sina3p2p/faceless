export default function VariantNode({
    url,
    type,
    modelUsed,
    isActive,
    onClick,
}: {
    url: string;
    type: "image" | "video";
    modelUsed: string | null;
    isActive: boolean;
    onClick?: () => void;
}) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            disabled={isActive}
            className={`shrink-0 flex flex-col items-center gap-1 group/vnode transition-all ${isActive ? "" : "opacity-50 hover:opacity-100"
                }`}
        >
            <div className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors relative ${isActive
                ? "border-violet-500 ring-1 ring-violet-500/30"
                : "border-white/10 group-hover/vnode:border-white/30"
                }`}>
                {type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <video src={url} className="w-full h-full object-cover" muted />
                )}
                {isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-violet-500/20">
                        <svg className="w-3 h-3 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                )}
                {!isActive && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/vnode:opacity-100 transition-opacity">
                        <span className="text-[8px] text-white font-semibold">Use</span>
                    </div>
                )}
            </div>
            <span className="text-[7px] text-gray-600 truncate max-w-14 leading-none">
                {modelUsed || "—"}
            </span>
        </button>
    );
}