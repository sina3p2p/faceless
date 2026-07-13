function ClapperIcon() {
  return (
    <div className="relative w-20 h-20 mb-1">
      {/* Soft glow behind the icon */}
      <div className="absolute inset-0 rounded-full bg-white/4 blur-2xl scale-150" />

      <svg
        viewBox="0 0 80 80"
        fill="none"
        className="relative w-full h-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        aria-hidden
      >
        {/* Film reel (behind) */}
        <circle cx="52" cy="48" r="18" fill="url(#reelGrad)" stroke="#6b7280" strokeWidth="1.2" />
        <circle cx="52" cy="48" r="6" fill="#1a1a1a" stroke="#6b7280" strokeWidth="1" />
        {[0, 60, 120, 180, 240, 300].map((deg) => {
          const r = 12;
          const rad = (deg * Math.PI) / 180;
          const x = 52 + Math.cos(rad) * r;
          const y = 48 + Math.sin(rad) * r;
          return <circle key={deg} cx={x} cy={y} r="2.2" fill="#374151" stroke="#6b7280" strokeWidth="0.6" />;
        })}

        {/* Clapperboard body */}
        <rect x="14" y="28" width="40" height="30" rx="3" fill="url(#boardGrad)" stroke="#9ca3af" strokeWidth="1.2" />
        {/* Clapper stripes */}
        <path d="M14 28 L54 28 L54 38 L14 38 Z" fill="#1f2937" stroke="#9ca3af" strokeWidth="1" />
        <path d="M18 28 L24 38 M28 28 L34 38 M38 28 L44 38" stroke="#d1d5db" strokeWidth="2.2" strokeLinecap="round" />
        {/* Open clapper lid */}
        <path
          d="M14 28 L20 14 L58 18 L54 28"
          fill="url(#lidGrad)"
          stroke="#9ca3af"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path d="M24 16 L28 26 M34 17 L37 27 M44 18 L46 27" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" />
        {/* Screen window */}
        <rect x="20" y="42" width="28" height="10" rx="1.5" fill="#111827" stroke="#4b5563" strokeWidth="0.8" />

        {/* Sparkles */}
        <path d="M12 22 L13.2 24.8 L16 26 L13.2 27.2 L12 30 L10.8 27.2 L8 26 L10.8 24.8 Z" fill="#e5e7eb" opacity="0.9" />
        <path d="M62 20 L62.8 21.8 L64.6 22.6 L62.8 23.4 L62 25.2 L61.2 23.4 L59.4 22.6 L61.2 21.8 Z" fill="#e5e7eb" opacity="0.75" />
        <path d="M66 40 L66.5 41.2 L67.7 41.7 L66.5 42.2 L66 43.4 L65.5 42.2 L64.3 41.7 L65.5 41.2 Z" fill="#e5e7eb" opacity="0.6" />

        <defs>
          <linearGradient id="boardGrad" x1="14" y1="28" x2="54" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9ca3af" />
            <stop offset="1" stopColor="#4b5563" />
          </linearGradient>
          <linearGradient id="lidGrad" x1="14" y1="14" x2="58" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d1d5db" />
            <stop offset="1" stopColor="#6b7280" />
          </linearGradient>
          <linearGradient id="reelGrad" x1="34" y1="30" x2="70" y2="66" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6b7280" />
            <stop offset="1" stopColor="#374151" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

function GhostTimeline() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-[28%] pointer-events-none select-none overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-t from-black via-black/80 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-full opacity-[0.28] blur-[1.5px]">
        {/* Header row */}
        <div className="flex items-center gap-3 px-4 h-10 border-t border-white/10">
          <span className="text-[11px] font-mono text-white/70 tracking-wider">00:00:00</span>
          <div className="flex-1" />
          <div className="w-7 h-7 rounded-full border border-white/20 flex items-center justify-center">
            <div className="w-0 h-0 border-y-[5px] border-y-transparent border-l-8 border-l-white/50 ml-0.5" />
          </div>
          <div className="flex-1" />
          <span className="text-[11px] font-mono text-white/40 tracking-wider">00:00:00</span>
        </div>
        {/* Track rows */}
        <div className="relative px-4 pt-2 space-y-2">
          {/* Playhead */}
          <div className="absolute left-16 top-0 bottom-0 w-px bg-violet-400/80 z-10" />
          <div className="h-8 rounded-md bg-white/10 w-[55%]" />
          <div className="h-8 rounded-md bg-white/[0.07] w-[40%] ml-[8%]" />
          <div className="h-6 rounded-md bg-white/5 w-[70%]" />
        </div>
      </div>
    </div>
  );
}

export function EmptyEditorState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
      {/* Soft radial wash */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 42%, rgba(255,255,255,0.045) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-3 text-center px-6 -mt-10">
        <ClapperIcon />
        <h2 className="text-[1.35rem] sm:text-2xl font-semibold text-white tracking-tight">
          Your video will land here.
        </h2>
        <p className="text-sm text-white/40 max-w-88 leading-relaxed">
          Once ready, you&apos;ll get a full timeline and editor to refine your video.
        </p>
      </div>

      <GhostTimeline />
    </div>
  );
}
