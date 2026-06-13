"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const NICHES = [
  {
    label: "Scary Stories",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.08)",
    border: "rgba(167,139,250,0.25)",
    title: "The House at the End of Pine Street",
    script: "Nobody had entered that house in over 30 years. The locals said it was cursed. What investigators found inside would change everything they thought they knew about that night...",
  },
  {
    label: "Mythology",
    color: "#818cf8",
    bg: "rgba(129,140,248,0.08)",
    border: "rgba(129,140,248,0.25)",
    title: "The God Even Zeus Feared",
    script: "In the golden age of the gods, when titans still walked the earth, there existed a force so powerful that even the king of Olympus refused to speak its name...",
  },
  {
    label: "True Crime",
    color: "#fb7185",
    bg: "rgba(251,113,133,0.08)",
    border: "rgba(251,113,133,0.25)",
    title: "The Case That Baffled Detectives for 20 Years",
    script: "June 14th, 1994. Detective Harris arrived at the scene expecting a routine call. What he found would haunt his career — and an entire city — for two decades...",
  },
  {
    label: "Finance Tips",
    color: "#34d399",
    bg: "rgba(52,211,153,0.08)",
    border: "rgba(52,211,153,0.25)",
    title: "5 Money Rules Rich People Never Talk About",
    script: "The wealthy don't follow the same financial rules they teach you in school. After interviewing 200 millionaires, I found a pattern that almost nobody talks about...",
  },
  {
    label: "History",
    color: "#60a5fa",
    bg: "rgba(96,165,250,0.08)",
    border: "rgba(96,165,250,0.25)",
    title: "The Day Rome Almost Never Happened",
    script: "On a cold February morning in 509 BC, a single decision by one man either saved or destroyed what would become the greatest empire in human history...",
  },
  {
    label: "Motivation",
    color: "#fbbf24",
    bg: "rgba(251,191,36,0.08)",
    border: "rgba(251,191,36,0.25)",
    title: "Why 99% of People Never Reach Their Goals",
    script: "It's not laziness. It's not lack of talent. After studying thousands of high achievers, the pattern is brutally clear — and it has nothing to do with motivation...",
  },
  {
    label: "Science Facts",
    color: "#22d3ee",
    bg: "rgba(34,211,238,0.08)",
    border: "rgba(34,211,238,0.25)",
    title: "Your Brain Has Been Lying to You",
    script: "Every memory you think is real has been silently altered. Scientists have now proven that the human brain rewrites your past — and the implications are terrifying...",
  },
  {
    label: "Anime Stories",
    color: "#f472b6",
    bg: "rgba(244,114,182,0.08)",
    border: "rgba(244,114,182,0.25)",
    title: "The Real Story Behind Attack on Titan",
    script: "Hajime Isayama didn't write Attack on Titan in a vacuum. The real-world history that inspired this anime is darker than anything in the show itself...",
  },
];

const STAGES = [
  "Writing script",
  "Generating voice",
  "Matching visuals",
  "Adding captions",
  "Rendering HD",
];

function WaveformBars({ color }: { color: string }) {
  return (
    <div className="flex items-end gap-[2px] h-8 w-full">
      {Array.from({ length: 24 }).map((_, i) => (
        <motion.div
          key={i}
          className="flex-1 rounded-sm"
          style={{ background: color, opacity: 0.55 }}
          animate={{ height: ["25%", `${30 + Math.sin(i * 0.8) * 50}%`, "25%"] }}
          transition={{
            duration: 0.8 + (i % 4) * 0.2,
            repeat: Infinity,
            delay: i * 0.04,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function NichePicker() {
  const [selected, setSelected] = useState(0);
  const [phase, setPhase] = useState<"idle" | "generating" | "done">("generating");
  const [stageIdx, setStageIdx] = useState(0);
  const [titleText, setTitleText] = useState("");
  const tidRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sidRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const niche = NICHES[selected];

  const startGeneration = (idx: number) => {
    const n = NICHES[idx];
    setPhase("generating");
    setStageIdx(0);
    setTitleText("");

    if (tidRef.current) clearInterval(tidRef.current);
    if (sidRef.current) clearInterval(sidRef.current);

    // Typewriter for title
    let i = 0;
    tidRef.current = setInterval(() => {
      i++;
      setTitleText(n.title.slice(0, i));
      if (i >= n.title.length) clearInterval(tidRef.current!);
    }, 28);

    // Advance pipeline stages
    let s = 0;
    sidRef.current = setInterval(() => {
      s++;
      if (s < STAGES.length) {
        setStageIdx(s);
      } else {
        clearInterval(sidRef.current!);
        setPhase("done");
      }
    }, 550);
  };

  useEffect(() => {
    startGeneration(0);
    return () => {
      if (tidRef.current) clearInterval(tidRef.current);
      if (sidRef.current) clearInterval(sidRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (i: number) => {
    setSelected(i);
    startGeneration(i);
  };

  return (
    <div className="w-full">
      {/* Label */}
      <p className="text-[0.75rem] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
        Pick a niche — watch the AI work
      </p>

      {/* Niche pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {NICHES.map((n, i) => (
          <button
            key={n.label}
            onClick={() => handleSelect(i)}
            className="px-3.5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer"
            style={{
              background: selected === i ? n.bg : "var(--surface)",
              border: `1px solid ${selected === i ? n.border : "var(--border)"}`,
              color: selected === i ? n.color : "var(--secondary-foreground)",
            }}
          >
            {n.label}
          </button>
        ))}
      </div>

      {/* Generation preview card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 14, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.99 }}
          transition={{ duration: 0.3, ease: [0.25, 0.4, 0.25, 1] }}
          className="rounded-2xl overflow-hidden"
          style={{ border: `1px solid ${niche.border}`, background: niche.bg }}
        >
          {/* Card top bar */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: `1px solid ${niche.border}` }}
          >
            <div className="flex gap-1.5">
              {["#ff5f57", "#ffbd2e", "#28c840"].map((c, j) => (
                <div key={j} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.6 }} />
              ))}
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[0.6875rem] font-medium" style={{ color: "var(--muted-foreground)" }}>
                faceless.ai
              </span>
              <span className="text-[0.6875rem]" style={{ color: "var(--muted-foreground)" }}>·</span>
              <span
                className="text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: niche.bg, color: niche.color, border: `1px solid ${niche.border}` }}
              >
                {niche.label}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {phase === "generating" ? (
                <motion.div
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="flex items-center gap-1.5"
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: niche.color }} />
                  <span className="text-[0.6875rem] font-semibold" style={{ color: niche.color }}>
                    Generating
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-1.5"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[0.6875rem] font-semibold text-emerald-400">Ready</span>
                </motion.div>
              )}
            </div>
          </div>

          {/* Card body */}
          <div className="flex gap-4 p-4">
            {/* Left: 9:16 thumbnail */}
            <div
              className="w-[72px] shrink-0 rounded-xl overflow-hidden relative"
              style={{ height: 128, background: "linear-gradient(160deg, #0d1117 0%, #16213e 60%, #0f3460 100%)" }}
            >
              {/* Scanlines */}
              <div
                className="absolute inset-0 opacity-10"
                style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.15) 2px, rgba(255,255,255,0.15) 3px)" }}
              />
              {/* Waveform or play icon */}
              <div className="absolute inset-0 flex flex-col items-center justify-center px-1 pb-2">
                {phase === "generating" ? (
                  <WaveformBars color={niche.color} />
                ) : (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={{ background: niche.bg, border: `1px solid ${niche.border}`, boxShadow: `0 0 20px ${niche.color}40` }}
                  >
                    <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24" style={{ color: niche.color }}>
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </motion.div>
                )}
              </div>
              {/* Caption strip at bottom */}
              {phase === "done" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute bottom-1.5 left-1 right-1 text-center"
                >
                  <p className="text-[0.4rem] font-black uppercase tracking-wider text-white" style={{ textShadow: `0 0 8px ${niche.color}` }}>
                    {niche.title.split(" ").slice(0, 3).join(" ")}
                  </p>
                </motion.div>
              )}
            </div>

            {/* Right: title + pipeline */}
            <div className="flex-1 min-w-0">
              {/* Title with typewriter */}
              <div className="mb-3 min-h-[2.5rem]">
                <p className="text-sm font-semibold text-white leading-snug">
                  {titleText}
                  {phase === "generating" && titleText.length < niche.title.length && (
                    <span className="inline-block w-0.5 h-3.5 ml-px bg-white align-middle animate-cursor" />
                  )}
                </p>
              </div>

              {/* Pipeline */}
              <div className="space-y-1.5">
                {STAGES.map((stage, i) => {
                  const done = i < stageIdx || phase === "done";
                  const active = i === stageIdx && phase === "generating";
                  return (
                    <div key={stage} className="flex items-center gap-2">
                      <motion.div
                        animate={active ? { opacity: [1, 0.3, 1] } : {}}
                        transition={{ duration: 0.7, repeat: Infinity }}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          background: done ? "#34d399" : active ? niche.color : "rgba(255,255,255,0.1)",
                        }}
                      />
                      <span
                        className="text-xs truncate"
                        style={{
                          color: done ? "var(--secondary-foreground)" : active ? "#fff" : "rgba(255,255,255,0.2)",
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {stage}
                      </span>
                      {done && (
                        <svg className="w-3 h-3 text-emerald-400 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Script excerpt */}
          <AnimatePresence>
            {phase === "done" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="px-4 pb-4"
              >
                <div
                  className="rounded-xl px-3 py-2.5 text-xs leading-relaxed italic"
                  style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${niche.border}`, color: "var(--secondary-foreground)" }}
                >
                  <span className="font-semibold not-italic" style={{ color: niche.color }}>Script: </span>
                  &ldquo;{niche.script}&rdquo;
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
