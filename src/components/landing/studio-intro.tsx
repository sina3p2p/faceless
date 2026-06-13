"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

function FilmStrip({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={`absolute ${side === "left" ? "left-0" : "right-0"} top-0 bottom-0 w-12 flex flex-col py-2 gap-1.5 overflow-hidden`}
      style={{
        background: "rgba(0,0,0,0.9)",
        [side === "left" ? "borderRight" : "borderLeft"]: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {Array.from({ length: 32 }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, x: side === "left" ? -20 : 20 }}
          animate={{ opacity: 0.3, x: 0 }}
          transition={{ delay: 0.05 + i * 0.012, duration: 0.3 }}
          className="mx-2 h-5 rounded-[2px] shrink-0"
          style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.08)" }}
        />
      ))}
    </div>
  );
}

function CountdownCircle({ n }: { n: number }) {
  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
      {/* Rotating arc */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)" }}>
        <motion.circle
          cx="32" cy="32" r="28"
          fill="none"
          strokeWidth="1.5"
          stroke="rgba(196,146,42,0.5)"
          strokeLinecap="round"
          initial={{ pathLength: 1 }}
          animate={{ pathLength: 0 }}
          transition={{ duration: 2.4, ease: "linear" }}
          style={{ strokeDasharray: "1 0" }}
        />
      </svg>
      {/* Number */}
      <AnimatePresence mode="wait">
        <motion.span
          key={n}
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.7 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="font-display text-2xl font-black tabular-nums"
          style={{ color: "var(--gold)" }}
        >
          {n}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

export function StudioIntro({ onDone }: { onDone: () => void }) {
  const [active, setActive] = useState(true);
  const [count, setCount] = useState(5);

  useEffect(() => {
    // Skip if already seen this session
    if (sessionStorage.getItem("faceless-intro-seen")) {
      setActive(false);
      onDone();
      return;
    }
    sessionStorage.setItem("faceless-intro-seen", "1");

    const countTimer = setInterval(() => setCount((c) => (c > 1 ? c - 1 : 1)), 300);
    const exitTimer = setTimeout(() => setActive(false), 2600);
    const doneTimer = setTimeout(onDone, 3300);

    return () => {
      clearInterval(countTimer);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="intro"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.03, filter: "brightness(2.5)" }}
          transition={{ duration: 0.75, ease: "easeIn" }}
          className="fixed inset-0 z-[99999] overflow-hidden flex items-center justify-center"
          style={{ background: "#000" }}
        >
          {/* Film strips */}
          <FilmStrip side="left" />
          <FilmStrip side="right" />

          {/* Scan line sweeping top→bottom */}
          <motion.div
            initial={{ y: "-100vh" }}
            animate={{ y: "100vh" }}
            transition={{ duration: 1.4, ease: "linear", delay: 0.1 }}
            className="absolute left-0 right-0 h-[2px] pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(196,146,42,0.6), transparent)",
              boxShadow: "0 0 20px rgba(196,146,42,0.4)",
            }}
          />

          {/* Content */}
          <div className="relative z-10 text-center px-16">
            {/* Top line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1], delay: 0.15 }}
              className="h-px w-72 mx-auto mb-10 origin-left"
              style={{ background: "linear-gradient(90deg, transparent, var(--gold) 50%, transparent)" }}
            />

            {/* Icon */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ duration: 0.7, delay: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
              className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 relative"
              style={{
                background: "rgba(196,146,42,0.08)",
                border: "1px solid rgba(196,146,42,0.45)",
                boxShadow: "0 0 60px rgba(196,146,42,0.25), inset 0 1px 0 rgba(196,146,42,0.2)",
              }}
            >
              <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ color: "var(--gold)" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            </motion.div>

            {/* Studio name with letter-spacing reveal */}
            <motion.h1
              initial={{ opacity: 0, letterSpacing: "0.8em", y: 10 }}
              animate={{ opacity: 1, letterSpacing: "0.22em", y: 0 }}
              transition={{ duration: 1.1, delay: 0.75 }}
              className="font-display font-black uppercase"
              style={{ fontSize: "clamp(1.4rem, 4vw, 2.2rem)", color: "var(--gold)" }}
            >
              Faceless
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 0.45, y: 0 }}
              transition={{ duration: 0.7, delay: 1.3 }}
              className="font-display text-[0.5625rem] tracking-[0.6em] uppercase mt-3"
              style={{ color: "var(--cream)" }}
            >
              AI Production Studios
            </motion.p>

            {/* Bottom line */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1], delay: 0.25 }}
              className="h-px w-72 mx-auto mt-10 origin-right"
              style={{ background: "linear-gradient(90deg, transparent, var(--gold) 50%, transparent)" }}
            />
          </div>

          {/* Countdown — top right */}
          <div className="absolute top-8 right-16">
            <CountdownCircle n={count} />
          </div>

          {/* Corner registration marks */}
          {[
            { pos: "top-10 left-16", b: "border-t border-l" },
            { pos: "top-10 right-16", b: "border-t border-r" },
            { pos: "bottom-10 left-16", b: "border-b border-l" },
            { pos: "bottom-10 right-16", b: "border-b border-r" },
          ].map(({ pos, b }, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 0.4, scale: 1 }}
              transition={{ delay: 0.35 + i * 0.07, duration: 0.35 }}
              className={`absolute w-10 h-10 ${pos} ${b}`}
              style={{ borderColor: "rgba(196,146,42,0.5)" }}
            />
          ))}

          {/* Bottom bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.25 }}
            transition={{ delay: 0.9 }}
            className="absolute bottom-7 left-0 right-0 flex items-center justify-center gap-6"
          >
            <span className="font-display text-[0.5rem] tracking-[0.45em] uppercase" style={{ color: "var(--gold)" }}>AI CINEMA</span>
            <div className="w-1 h-1 rounded-full" style={{ background: "var(--gold)" }} />
            <span className="font-display text-[0.5rem] tracking-[0.45em] uppercase" style={{ color: "var(--gold)" }}>{new Date().getFullYear()}</span>
            <div className="w-1 h-1 rounded-full" style={{ background: "var(--gold)" }} />
            <span className="font-display text-[0.5rem] tracking-[0.45em] uppercase" style={{ color: "var(--gold)" }}>REEL 001</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
