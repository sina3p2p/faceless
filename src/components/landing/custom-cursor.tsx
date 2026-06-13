"use client";

import { useEffect, useRef, useState } from "react";

type CursorMode = "default" | "link" | "play" | "drag";

export function CustomCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: -200, y: -200 });
  const lag = useRef({ x: -200, y: -200 });
  const raf = useRef<number>(0);
  const [mode, setMode] = useState<CursorMode>("default");
  const [visible, setVisible] = useState(false);
  const [isTouch, setIsTouch] = useState(true);

  useEffect(() => {
    // Don't render custom cursor on touch devices
    if (window.matchMedia("(pointer: coarse)").matches) return;
    setIsTouch(false);
    document.documentElement.style.setProperty("cursor", "none", "important");

    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (!visible) setVisible(true);
    };

    const onLeave = () => setVisible(false);
    const onEnter = () => setVisible(true);

    const onOver = (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("[data-cursor='play']")) setMode("play");
      else if (el.closest("a,button,[role='button']")) setMode("link");
      else setMode("default");
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    document.addEventListener("mouseover", onOver, { passive: true });

    const loop = () => {
      const lerp = 0.1;
      lag.current.x += (mouse.current.x - lag.current.x) * lerp;
      lag.current.y += (mouse.current.y - lag.current.y) * lerp;

      if (ringRef.current) {
        ringRef.current.style.transform = `translate(${lag.current.x}px, ${lag.current.y}px)`;
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${mouse.current.x}px, ${mouse.current.y}px)`;
      }
      raf.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      document.documentElement.style.removeProperty("cursor");
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
      document.removeEventListener("mouseover", onOver);
      cancelAnimationFrame(raf.current);
    };
  }, [visible]);

  if (isTouch) return null;

  const ringSize = mode === "play" ? 76 : mode === "link" ? 48 : 30;

  return (
    <>
      {/* Lagged ring */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 pointer-events-none z-[99995] rounded-full"
        style={{
          width: ringSize,
          height: ringSize,
          marginLeft: -ringSize / 2,
          marginTop: -ringSize / 2,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.3s, width 0.25s cubic-bezier(0.34,1.56,0.64,1), height 0.25s cubic-bezier(0.34,1.56,0.64,1), margin 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          border: mode === "play" ? "1.5px solid rgba(196,146,42,0.7)" : mode === "link" ? "1.5px solid rgba(196,146,42,0.95)" : "1.5px solid rgba(196,146,42,0.55)",
          background: mode === "link" ? "rgba(196,146,42,0.08)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          willChange: "transform",
          backdropFilter: mode === "play" ? "blur(4px)" : "none",
        }}
      >
        {mode === "play" && (
          <span
            className="font-display font-bold text-[0.5rem] tracking-[0.25em] uppercase"
            style={{ color: "var(--gold)", letterSpacing: "0.2em" }}
          >
            PLAY
          </span>
        )}
      </div>

      {/* Exact-position dot */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 pointer-events-none z-[99996] rounded-full"
        style={{
          width: 4,
          height: 4,
          marginLeft: -2,
          marginTop: -2,
          background: "var(--gold)",
          opacity: visible && mode !== "link" ? 1 : 0,
          transition: "opacity 0.2s",
          willChange: "transform",
        }}
      />
    </>
  );
}
