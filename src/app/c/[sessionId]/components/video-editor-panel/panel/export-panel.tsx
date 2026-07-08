import type { InternalClip } from "../timeline/types";

export interface ExportPanelProps {
  internalClips: InternalClip[];
}

export function ExportPanel({ internalClips }: ExportPanelProps) {
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {internalClips.length === 0 ? (
        <span className="text-xs text-muted-foreground/40">No clips to export yet</span>
      ) : (
        <>
          <span className="text-[11px] text-muted-foreground/60 mb-1">Download clips</span>
          {internalClips.map((clip, i) => (
            <a key={clip.id} href={clip.videoUrl} download={`shot-${i + 1}.mp4`}
              className="flex items-center gap-2 text-xs text-primary hover:text-primary border border-primary/20 hover:border-primary/40 rounded-lg px-3 py-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Shot {i + 1}{clip.reversed ? " (REV)" : ""}
            </a>
          ))}
        </>
      )}
    </div>
  );
}
