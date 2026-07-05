export interface ComingSoonPanelProps {
  tab: "text" | "audio" | "effects";
}

export function ComingSoonPanel({ tab }: ComingSoonPanelProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-4">
      <svg className="w-4 h-4 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span className="text-xs text-muted-foreground/40">
        {tab === "text" ? "Text overlays" : tab === "audio" ? "Audio mixing" : "Visual effects"} — coming soon
      </span>
    </div>
  );
}
