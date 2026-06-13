"use client";

import { useEffect, useRef } from "react";

export function SpotlightCursor() {
  const spotRef = useRef<HTMLDivElement>(null);
  const trailRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const smooth = useRef({ x: 0, y: 0 });
  const raf = useRef<number>(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", onMove);

    const loop = () => {
      smooth.current.x += (mouse.current.x - smooth.current.x) * 0.06;
      smooth.current.y += (mouse.current.y - smooth.current.y) * 0.06;

      if (spotRef.current) {
        spotRef.current.style.transform = `translate(${smooth.current.x - 300}px, ${smooth.current.y - 300}px)`;
      }
      // Trail follows even more slowly
      if (trailRef.current) {
        trailRef.current.style.transform = `translate(${smooth.current.x - 150}px, ${smooth.current.y - 150}px)`;
      }

      raf.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <>
      {/* Large ambient spotlight */}
      <div
        ref={spotRef}
        className="fixed top-0 left-0 w-[600px] h-[600px] pointer-events-none"
        style={{
          zIndex: 9990,
          background: "radial-gradient(circle at center, rgba(196,146,42,0.055) 0%, rgba(196,146,42,0.02) 35%, transparent 65%)",
          filter: "blur(24px)",
          willChange: "transform",
        }}
      />
      {/* Tight inner glow */}
      <div
        ref={trailRef}
        className="fixed top-0 left-0 w-[300px] h-[300px] pointer-events-none"
        style={{
          zIndex: 9991,
          background: "radial-gradient(circle at center, rgba(196,146,42,0.04) 0%, transparent 60%)",
          willChange: "transform",
        }}
      />
    </>
  );
}
