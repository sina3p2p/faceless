import { useEffect, useLayoutEffect, useRef } from "react";

// Borrowed pattern from react-video-editor. Attaches global pointermove/
// pointerup once; callbacks are kept in refs so the effect never needs to
// re-run. The generic state T carries per-drag context.
export function usePointerDrag<T>(
  onMove: (state: T, ev: { clientX: number; clientY: number }) => void,
  onEnd?: (state: T) => void,
) {
  const moveRef = useRef(onMove);
  const endRef = useRef(onEnd);
  useLayoutEffect(() => {
    moveRef.current = onMove;
    endRef.current = onEnd;
  });

  const stateRef = useRef<T | null>(null);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (stateRef.current === null) return;
      moveRef.current(stateRef.current, { clientX: e.clientX, clientY: e.clientY });
    }
    function handleUp() {
      if (stateRef.current !== null) {
        endRef.current?.(stateRef.current);
        stateRef.current = null;
      }
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  return function startDrag(state: T, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    stateRef.current = state;
  };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
