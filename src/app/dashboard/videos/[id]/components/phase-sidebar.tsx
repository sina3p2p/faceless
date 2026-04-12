"use client";

import type { StudioPhaseId, PhaseInfo } from "../hooks/use-video-phase";

const PHASE_ICONS: Record<StudioPhaseId, React.ReactNode> = {
  story: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
    </svg>
  ),
  "pre-production": (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
    </svg>
  ),
  production: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  ),
  final: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 15.75h7.5" />
    </svg>
  ),
};

const STATUS_RING: Record<string, string> = {
  locked: "border-white/10 text-gray-600",
  processing: "border-violet-500 text-violet-400 animate-pulse",
  review: "border-amber-500 text-amber-400",
  done: "border-emerald-500 text-emerald-400",
};

export function PhaseSidebar({
  phases,
  activePhaseId,
  selectedPhaseId,
  onSelectPhase,
}: {
  phases: PhaseInfo[];
  activePhaseId: StudioPhaseId;
  selectedPhaseId: StudioPhaseId;
  onSelectPhase: (id: StudioPhaseId) => void;
}) {
  return (
    <nav className="w-48 shrink-0 border-r border-white/5 bg-black/30 flex flex-col">
      <div className="px-4 pt-5 pb-3">
        <span className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold">Pipeline</span>
      </div>
      <div className="flex-1 px-2 space-y-0.5">
        {phases.map((p, i) => {
          const isSelected = p.id === selectedPhaseId;
          const isActive = p.id === activePhaseId;
          const ringColor = STATUS_RING[p.status];
          const isAccessible = p.status !== "locked";

          return (
            <button
              key={p.id}
              onClick={() => isAccessible && onSelectPhase(p.id)}
              disabled={!isAccessible}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all group ${
                isSelected
                  ? "bg-white/6 text-white"
                  : isAccessible
                    ? "text-gray-400 hover:bg-white/3 hover:text-gray-200"
                    : "text-gray-700 cursor-not-allowed"
              }`}
            >
              {/* Phase status ring */}
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${ringColor}`}>
                {p.status === "done" ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : p.status === "processing" ? (
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                ) : (
                  PHASE_ICONS[p.id]
                )}
              </div>

              <div className="flex-1 min-w-0">
                <span className={`text-xs font-medium block ${isSelected ? "text-white" : ""}`}>
                  {p.label}
                </span>
                {isActive && p.status === "processing" && (
                  <span className="text-[10px] text-violet-400">Working...</span>
                )}
                {isActive && p.status === "review" && (
                  <span className="text-[10px] text-amber-400">Needs review</span>
                )}
              </div>

              {/* Connection line to next phase */}
              {i < phases.length - 1 && (
                <div className="absolute left-[2.15rem] top-full w-px h-0.5 bg-white/5" />
              )}
            </button>
          );
        })}
      </div>

      {/* Phase connection lines */}
      <div className="flex-1" />
    </nav>
  );
}
