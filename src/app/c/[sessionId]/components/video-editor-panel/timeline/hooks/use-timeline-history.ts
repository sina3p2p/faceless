import { useTimelineStore } from "../stores/use-timeline-store";

// Thin selector over the history-related fields mirrored from props —
// the actual undo/redo stack is owned by the parent (index.tsx), since it
// owns the canonical clip data that `tracks` is derived from.
export function useTimelineHistory() {
  const canUndo = useTimelineStore((s) => s.canUndo);
  const canRedo = useTimelineStore((s) => s.canRedo);
  const undo = useTimelineStore((s) => s.onUndo);
  const redo = useTimelineStore((s) => s.onRedo);
  return { canUndo, canRedo, undo, redo };
}
