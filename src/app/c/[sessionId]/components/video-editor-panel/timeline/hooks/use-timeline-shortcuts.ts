import { useEffect } from "react";
import { useTimelineStore } from "../stores/use-timeline-store";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

// Delete/Backspace → delete selection, Cmd/Ctrl+Z → undo, Cmd/Ctrl+Shift+Z →
// redo, Cmd/Ctrl+D → duplicate selection, Space → play/pause. Ignored while
// focus is in a text field.
export function useTimelineShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      const {
        selectedItemIds,
        onDeleteItems,
        onDuplicateItems,
        canUndo,
        canRedo,
        onUndo,
        onRedo,
        isPlaying,
        onPlay,
        onPause,
      } = useTimelineStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if ((e.key === "Delete" || e.key === "Backspace") && selectedItemIds.length > 0) {
        e.preventDefault();
        onDeleteItems(selectedItemIds);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          if (canRedo) onRedo();
        } else if (canUndo) {
          onUndo();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "d" && selectedItemIds.length > 0) {
        e.preventDefault();
        onDuplicateItems(selectedItemIds);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) onPause();
        else onPlay();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
