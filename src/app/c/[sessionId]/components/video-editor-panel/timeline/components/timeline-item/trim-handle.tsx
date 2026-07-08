export function TrimHandle({ edge, onPointerDown }: { edge: "start" | "end"; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); onPointerDown(e); }}
      className={`absolute top-0 bottom-0 w-3 z-10 flex items-center justify-center cursor-ew-resize group/h pointer-events-auto ${edge === "start" ? "left-0" : "right-0"
        }`}
    >
      {/* visible bar */}
      <div className="w-[3px] h-9 rounded-full bg-white/30 group-hover/h:bg-white transition-colors" />
      {/* notch dots */}
      <div className="absolute flex flex-col gap-[3px] pointer-events-none">
        <div className="w-[3px] h-[3px] rounded-full bg-white/70 group-hover/h:bg-white" />
        <div className="w-[3px] h-[3px] rounded-full bg-white/70 group-hover/h:bg-white" />
        <div className="w-[3px] h-[3px] rounded-full bg-white/70 group-hover/h:bg-white" />
      </div>
    </div>
  );
}
