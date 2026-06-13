"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const FILMS = [
  {
    id: "YY-M5bxTY28",
    title: "Discarded Companion",
    tagline: "Some bonds survive the end of the world.",
    genre: "Sci-Fi Drama",
    year: "2026",
    tool: "Kling + Veo 3",
    rating: "★★★★★",
  },
  {
    id: "KKm5foh8mOw",
    title: "Aavartan",
    tagline: "Darkness spirals into something ancient.",
    genre: "Atmospheric Horror",
    year: "2025",
    tool: "Google Veo 3",
    rating: "★★★★½",
  },
  {
    id: "BbDLRHxb9Y8",
    title: "SORA II — Cinematic Reel",
    tagline: "A new era of visual storytelling.",
    genre: "Action · Cinematic",
    year: "2025",
    tool: "OpenAI Sora 2",
    rating: "★★★★★",
  },
  {
    id: "Vk35Q7BPPPE",
    title: "The Day The World Ended II",
    tagline: "The chain reaction no one could stop.",
    genre: "Apocalyptic Sci-Fi",
    year: "2025",
    tool: "AI Generated",
    rating: "★★★★★",
  },
  {
    id: "ppVXCE_Yrr8",
    title: "The Day The World Ended I",
    tagline: "When the first domino fell.",
    genre: "Epic Drama",
    year: "2025",
    tool: "AI Generated",
    rating: "★★★★½",
  },
];

function FilmCard({ film, index }: { film: typeof FILMS[0]; index: number }) {
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 w-[380px] group"
      data-cursor="play"
    >
      {/* Video frame */}
      <div
        className="relative rounded-xl overflow-hidden cursor-none"
        style={{
          aspectRatio: "16/9",
          border: "1px solid rgba(255,255,255,0.07)",
          boxShadow: hovered
            ? "0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(196,146,42,0.2)"
            : "0 20px 50px rgba(0,0,0,0.6)",
          transition: "box-shadow 0.4s ease",
        }}
        onClick={() => setPlaying(true)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <AnimatePresence mode="wait">
          {playing ? (
            <motion.iframe
              key="frame"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${film.id}?autoplay=1&rel=0&modestbranding=1`}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <motion.div key="poster" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
              {/* Thumbnail — grayscale until hover */}
              <motion.img
                src={`https://img.youtube.com/vi/${film.id}/maxresdefault.jpg`}
                alt={film.title}
                className="w-full h-full object-cover"
                loading="lazy"
                animate={{ filter: hovered ? "grayscale(0%) brightness(1.05)" : "grayscale(100%) brightness(0.75)" }}
                transition={{ duration: 0.55, ease: "easeOut" }}
                onError={(e) => { (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${film.id}/hqdefault.jpg`; }}
              />

              {/* Vignette */}
              <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.65) 100%)" }} />

              {/* Film perforations top */}
              <div className="absolute top-0 left-0 right-0 flex gap-1.5 px-3 pt-2 pb-1.5"
                style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)" }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="w-3 h-2 rounded-[2px] shrink-0 opacity-50" style={{ background: "rgba(255,255,255,0.2)" }} />
                ))}
              </div>

              {/* Film perforations bottom */}
              <div className="absolute bottom-0 left-0 right-0 flex gap-1.5 px-3 pt-1.5 pb-2"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)" }}>
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className="w-3 h-2 rounded-[2px] shrink-0 opacity-50" style={{ background: "rgba(255,255,255,0.2)" }} />
                ))}
              </div>

              {/* AI badge */}
              <div className="absolute top-7 right-3">
                <span className="text-[0.5rem] font-bold tracking-widest uppercase px-2 py-1 rounded"
                  style={{ background: "rgba(0,0,0,0.8)", color: "var(--gold)", border: "1px solid var(--gold-border)", backdropFilter: "blur(8px)" }}>
                  AI GENERATED
                </span>
              </div>

              {/* Center play ring */}
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div
                  animate={{ scale: hovered ? 1 : 0.85, opacity: hovered ? 1 : 0.6 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{
                    background: "rgba(196,146,42,0.1)",
                    border: `2px solid rgba(196,146,42,${hovered ? 0.8 : 0.4})`,
                    backdropFilter: "blur(10px)",
                    boxShadow: hovered ? "0 0 50px rgba(196,146,42,0.35)" : "none",
                  }}
                >
                  <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 24 24" style={{ color: "var(--gold)" }}>
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </motion.div>
              </div>

              {/* Color wash on hover */}
              <motion.div
                className="absolute inset-0"
                animate={{ opacity: hovered ? 1 : 0 }}
                transition={{ duration: 0.4 }}
                style={{ background: "linear-gradient(to top, rgba(196,146,42,0.08) 0%, transparent 50%)" }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Credits */}
      <motion.div
        className="mt-4 px-1"
        animate={{ opacity: hovered ? 1 : 0.65 }}
        transition={{ duration: 0.3 }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-display text-sm font-semibold tracking-[0.06em] uppercase" style={{ color: "var(--cream)" }}>
            {film.title}
          </h3>
          <span className="text-xs shrink-0" style={{ color: "var(--gold)" }}>{film.rating}</span>
        </div>
        <p className="text-[0.6875rem] mb-2 italic" style={{ color: "var(--secondary-foreground)" }}>
          &ldquo;{film.tagline}&rdquo;
        </p>
        <div className="flex items-center gap-2 text-[0.5625rem] font-semibold tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>
          <span>{film.genre}</span>
          <span>·</span>
          <span>{film.year}</span>
          <span>·</span>
          <span style={{ color: "rgba(196,146,42,0.7)" }}>{film.tool}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function FilmShowcase() {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    startX.current = e.pageX - (trackRef.current?.offsetLeft ?? 0);
    scrollLeft.current = trackRef.current?.scrollLeft ?? 0;
    if (trackRef.current) trackRef.current.style.cursor = "grabbing";
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !trackRef.current) return;
    const x = e.pageX - trackRef.current.offsetLeft;
    trackRef.current.scrollLeft = scrollLeft.current - (x - startX.current) * 1.5;
  };
  const onMouseUp = () => {
    isDragging.current = false;
    if (trackRef.current) trackRef.current.style.cursor = "";
  };

  return (
    <div>
      {/* NOW PLAYING marquee */}
      <div
        className="flex items-center gap-0 overflow-hidden mb-10"
        style={{ borderTop: "1px solid var(--gold-border)", borderBottom: "1px solid var(--gold-border)", height: 36 }}
      >
        <div className="flex items-center gap-8 animate-marquee whitespace-nowrap">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-8">
              <span className="font-display text-[0.5625rem] font-bold tracking-[0.38em] uppercase" style={{ color: "var(--gold)" }}>NOW PLAYING</span>
              <span style={{ color: "var(--gold-border)" }}>✦</span>
              <span className="font-display text-[0.5625rem] tracking-[0.38em] uppercase" style={{ color: "rgba(196,146,42,0.45)" }}>AI CINEMA</span>
              <span style={{ color: "var(--gold-border)" }}>✦</span>
              <span className="font-display text-[0.5625rem] tracking-[0.38em] uppercase" style={{ color: "rgba(196,146,42,0.45)" }}>IN PRODUCTION</span>
              <span style={{ color: "var(--gold-border)" }}>✦</span>
            </div>
          ))}
        </div>
      </div>

      {/* Film cards — drag to scroll */}
      <div
        ref={trackRef}
        className="flex gap-6 overflow-x-auto scrollbar-none pb-6 px-6 select-none"
        style={{ maskImage: "linear-gradient(90deg, transparent 0%, black 3%, black 97%, transparent 100%)" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {FILMS.map((film, i) => (
          <FilmCard key={film.id} film={film} index={i} />
        ))}
      </div>

      <p className="text-center text-[0.625rem] font-display tracking-widest uppercase mt-3" style={{ color: "var(--muted-foreground)" }}>
        Drag to explore · Click to play
      </p>
    </div>
  );
}
