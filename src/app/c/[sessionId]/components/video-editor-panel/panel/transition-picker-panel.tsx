import type { Dispatch, SetStateAction } from "react";
import { FloatingPanel } from "../../floating-panel";
import type { InternalClip, TransitionSetting } from "../timeline/types";

export interface TransitionPickerPanelProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  transitionPickerFor: string | null;
  internalClips: InternalClip[];
  clipTransitions: Map<string, TransitionSetting>;
  setClipTransitions: Dispatch<SetStateAction<Map<string, TransitionSetting>>>;
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

export function TransitionPickerPanel({
  containerRef,
  transitionPickerFor,
  internalClips,
  clipTransitions,
  setClipTransitions,
  visible,
  setVisible,
}: TransitionPickerPanelProps) {
  if (transitionPickerFor === null) return null;
  const clip = internalClips.find((c) => c.id === transitionPickerFor);
  if (!clip) return null;
  const trans = clipTransitions.get(clip.id);

  if (!visible) return null;

  return (
    <FloatingPanel
      containerRef={containerRef}
      initialPos={{ x: 16, y: 60 }}
      title="Transition"
      icon={
        <svg className="w-3.5 h-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M6 1 L11 6 L6 11 L1 6 Z" />
        </svg>
      }
      visible={visible}
      setVisible={setVisible}
      width={280}
      zIndex={40}
    >
      <div className="px-3 py-3 flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1.5">
          {([
            { type: "cut", label: "Cut", icon: "✂" },
            { type: "dissolve", label: "Dissolve", icon: "⊕" },
            { type: "fade-black", label: "Fade", icon: "◼" },
            { type: "slide-left", label: "Slide ←", icon: "←" },
            { type: "slide-right", label: "Slide →", icon: "→" },
            { type: "slide-up", label: "Slide ↑", icon: "↑" },
            { type: "slide-down", label: "Slide ↓", icon: "↓" },
            { type: "zoom-in", label: "Zoom", icon: "⊙" },
            { type: "wipe-left", label: "Wipe →", icon: "▶" },
            { type: "wipe-right", label: "Wipe ←", icon: "◀" },
          ] as const).map(({ type, label, icon }) => {
            const active = (trans?.type ?? "cut") === type;
            return (
              <button
                key={type}
                onClick={() =>
                  setClipTransitions((prev) => {
                    const next = new Map(prev);
                    if (type === "cut") next.delete(clip.id);
                    else next.set(clip.id, { type, duration: trans?.duration ?? 0.5 });
                    return next;
                  })
                }
                className={`flex flex-col items-center gap-0.5 py-2 rounded-xl text-[10px] font-semibold transition-all ${active
                  ? "bg-primary text-foreground shadow shadow-violet-900/50"
                  : "bg-white/6 text-muted-foreground hover:bg-white/12 hover:text-foreground"
                  }`}
              >
                <span className="text-base leading-none">{icon}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {trans && trans.type !== "cut" && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-muted-foreground/60">Duration</span>
              <span className="text-[11px] font-mono text-foreground">{trans.duration.toFixed(1)}s</span>
            </div>
            <input
              type="range" min={0.1} max={2} step={0.1}
              value={trans.duration}
              onChange={(e) => {
                const dur = Number(e.target.value);
                setClipTransitions((prev) => new Map(prev).set(clip.id, { ...trans, duration: dur }));
              }}
              className="w-full h-1 appearance-none bg-white/15 rounded-full cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md"
            />
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
