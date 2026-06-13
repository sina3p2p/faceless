"use client";

import { motion } from "framer-motion";

const STAGES = [
  { label: "Writing script", done: true },
  { label: "Generating voice", done: true },
  { label: "Picking visuals", active: true, progress: 68 },
  { label: "Adding captions", done: false },
  { label: "Final render", done: false },
];

export function VideoMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.9, ease: [0.23, 0.86, 0.39, 0.96] }}
      className="relative w-full max-w-[280px] mx-auto"
      style={{ perspective: 1200 }}
    >
      {/* Ambient glow behind */}
      <div
        className="absolute -inset-6 rounded-3xl blur-[50px] opacity-25 pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.7) 0%, rgba(139,92,246,0.4) 50%, transparent 80%)",
        }}
      />

      {/* The floating mockup */}
      <motion.div
        animate={{ y: [0, -14, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Main card */}
        <div
          className="relative rounded-[20px] overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #111118 0%, #09090f 100%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow:
              "0 50px 100px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.07)",
          }}
        >
          {/* Macbook-style traffic lights */}
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {["#ff5f57", "#ffbd2e", "#28c840"].map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.65 }} />
            ))}
            <p className="flex-1 text-center text-[0.6rem] font-medium" style={{ color: "var(--muted-foreground)" }}>
              faceless.ai — generating
            </p>
          </div>

          {/* 9:16 video thumbnail */}
          <div className="mx-3.5 mt-3 rounded-xl overflow-hidden relative" style={{ height: 158 }}>
            {/* Dark cinematic bg */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(160deg, #0d1117 0%, #1a1a2e 40%, #16213e 70%, #0f3460 100%)",
              }}
            />
            {/* CRT scanlines */}
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(99,102,241,0.3) 2px, rgba(99,102,241,0.3) 3px)",
              }}
            />
            {/* Vignette */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.65) 100%)",
              }}
            />

            {/* Floating particles in video */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 rounded-full"
                style={{
                  background: "rgba(139,92,246,0.7)",
                  left: `${15 + i * 14}%`,
                  top: `${20 + (i % 3) * 20}%`,
                  boxShadow: "0 0 6px rgba(139,92,246,0.8)",
                }}
                animate={{
                  y: [0, -12, 0],
                  opacity: [0.4, 0.9, 0.4],
                }}
                transition={{
                  duration: 2.5 + i * 0.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: i * 0.35,
                }}
              />
            ))}

            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm"
                style={{
                  background: "rgba(99,102,241,0.75)",
                  border: "1px solid rgba(129,140,248,0.4)",
                  boxShadow: "0 0 20px rgba(99,102,241,0.5)",
                }}
              >
                <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </motion.div>
            </div>

            {/* Caption overlay */}
            <div className="absolute bottom-2.5 left-2 right-2 text-center">
              <motion.p
                animate={{ opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-[0.625rem] font-black text-white tracking-widest uppercase"
                style={{ textShadow: "0 0 12px rgba(99,102,241,0.9), 0 1px 3px rgba(0,0,0,0.9)" }}
              >
                THE MOST TERRIFYING
              </motion.p>
              <p
                className="text-[0.5rem] font-bold tracking-[0.2em] uppercase mt-0.5"
                style={{ color: "#818cf8", textShadow: "0 0 8px rgba(99,102,241,0.6)" }}
              >
                Ancient Myths
              </p>
            </div>
          </div>

          {/* Pipeline stages */}
          <div className="px-3.5 py-3 space-y-2">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center gap-2">
                <motion.div
                  animate={s.active ? { opacity: [1, 0.4, 1] } : {}}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: s.done
                      ? "#34d399"
                      : s.active
                      ? "#818cf8"
                      : "rgba(255,255,255,0.12)",
                  }}
                />
                <span
                  className="text-[0.6875rem] flex-1 truncate"
                  style={{
                    color: s.done
                      ? "var(--secondary-foreground)"
                      : s.active
                      ? "#fff"
                      : "rgba(255,255,255,0.25)",
                    fontWeight: s.active ? 600 : 400,
                  }}
                >
                  {s.label}
                </span>
                {s.done && (
                  <svg className="w-3 h-3 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                )}
                {s.active && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: "linear-gradient(90deg, #6366f1, #818cf8)" }}
                        initial={{ width: "0%" }}
                        animate={{ width: "68%" }}
                        transition={{ duration: 1.8, delay: 0.3, ease: "easeOut" }}
                      />
                    </div>
                    <span className="text-[0.5625rem] font-semibold" style={{ color: "#818cf8" }}>68%</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Fade bottom */}
          <div className="h-3" style={{ background: "linear-gradient(to bottom, transparent, rgba(9,9,15,0.6))" }} />
        </div>
      </motion.div>

      {/* Floating badge: Voice ready */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.6, duration: 0.7, ease: "easeOut" }}
      >
        <motion.div
          animate={{ y: [0, -6, 0], rotate: [0, 0.5, 0] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="absolute -left-14 top-10 rounded-xl px-3 py-2"
          style={{
            background: "rgba(17,17,25,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)" }}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "#a78bfa" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75" />
              </svg>
            </div>
            <div>
              <p className="text-[0.625rem] font-semibold text-white leading-none">Voice ready</p>
              <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--muted-foreground)" }}>Alex · 94s</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Floating badge: HD Ready */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.9, duration: 0.7, ease: "easeOut" }}
      >
        <motion.div
          animate={{ y: [0, -8, 0], rotate: [0, -0.6, 0] }}
          transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          className="absolute -right-12 bottom-16 rounded-xl px-3 py-2"
          style={{
            background: "rgba(17,17,25,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.2)" }}
            >
              <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="text-[0.625rem] font-semibold text-white leading-none">HD Ready</p>
              <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--muted-foreground)" }}>1080×1920</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Floating badge: Script done */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.2, duration: 0.7, ease: "easeOut" }}
      >
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
          className="absolute -right-10 top-8 rounded-xl px-3 py-2"
          style={{
            background: "rgba(17,17,25,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.25)" }}
            >
              <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </div>
            <div>
              <p className="text-[0.625rem] font-semibold text-white leading-none">Script done</p>
              <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--muted-foreground)" }}>312 words</p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
