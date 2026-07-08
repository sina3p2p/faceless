// Shown in place of a clip's normal content while it's being dragged — a
// hatched placeholder makes the resolved (snapped) landing position obvious
// without redrawing thumbnails/waveforms on every pointermove.
export function DragPlaceholder() {
  return (
    <div
      className="absolute inset-0 rounded-lg border-2 border-primary"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, color-mix(in oklch, var(--primary) 30%, transparent) 0px, color-mix(in oklch, var(--primary) 30%, transparent) 8px, color-mix(in oklch, var(--primary) 50%, transparent) 8px, color-mix(in oklch, var(--primary) 50%, transparent) 16px)",
      }}
    />
  );
}
