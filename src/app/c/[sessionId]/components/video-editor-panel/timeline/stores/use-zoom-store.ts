import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PX_PER_SEC, MAX_PX_PER_SEC, MIN_PX_PER_SEC } from "../constants";

interface ZoomState {
  pxPerSec: number;
  setPxPerSec: (px: number | ((prev: number) => number)) => void;
}

function clamp(px: number) {
  return Math.max(MIN_PX_PER_SEC, Math.min(MAX_PX_PER_SEC, Math.round(px)));
}

export const useZoomStore = create<ZoomState>()(
  persist(
    (set) => ({
      pxPerSec: DEFAULT_PX_PER_SEC,
      setPxPerSec: (px) =>
        set((state) => ({ pxPerSec: clamp(typeof px === "function" ? px(state.pxPerSec) : px) })),
    }),
    { name: "timeline-zoom" },
  ),
);
