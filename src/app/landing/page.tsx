"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ParticleCanvas } from "@/components/landing/particle-canvas";
import { FloatingShapes } from "@/components/landing/floating-shapes";
import { NichePicker } from "@/components/landing/niche-picker";
import { TestimonialTicker } from "@/components/landing/testimonial-ticker";
import { AnimatedStat } from "@/components/landing/animated-stat";
import { FilmShowcase } from "@/components/landing/film-showcase";
import { GrainOverlay } from "@/components/landing/grain-overlay";
import { StudioIntro } from "@/components/landing/studio-intro";
import { SpotlightCursor } from "@/components/landing/spotlight-cursor";
import { CustomCursor } from "@/components/landing/custom-cursor";
import { ScrambleText } from "@/components/landing/scramble-text";

// ─── Magnetic button ──────────────────────────────────────────────────────────
function MagneticWrap({ children, strength = 0.38 }: { children: React.ReactNode; strength?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 160, damping: 18 });
  const y = useSpring(0, { stiffness: 160, damping: 18 });
  const handleMove = useCallback((e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    x.set((e.clientX - r.left - r.width / 2) * strength);
    y.set((e.clientY - r.top - r.height / 2) * strength);
  }, [x, y, strength]);
  const reset = useCallback(() => { x.set(0); y.set(0); }, [x, y]);
  return (
    <motion.div ref={ref} style={{ x, y, display: "inline-block" }} onMouseMove={handleMove} onMouseLeave={reset}>
      {children}
    </motion.div>
  );
}

// ─── Gold dust particle ───────────────────────────────────────────────────────
function DustParticle({ left, delay }: { left: string; delay: number }) {
  return (
    <motion.div
      className="absolute bottom-0 w-px h-px rounded-full pointer-events-none"
      style={{ left, background: "rgba(196,146,42,0.8)", boxShadow: "0 0 6px rgba(196,146,42,0.7)" }}
      animate={{ y: [0, -320, -420], x: [0, 14, -10], opacity: [0, 0.8, 0], scale: [0.5, 1.5, 0.2] }}
      transition={{ duration: 4.5 + delay * 0.5, repeat: Infinity, delay: delay * 0.7, ease: "easeOut" }}
    />
  );
}

// ─── Projector cone ───────────────────────────────────────────────────────────
function ProjectorBeam() {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none overflow-hidden" style={{ width: "100%", height: "100%" }}>
      <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "520px solid transparent", borderRight: "520px solid transparent", borderTop: "900px solid rgba(196,146,42,0.016)", filter: "blur(45px)" }} />
      <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "160px solid transparent", borderRight: "160px solid transparent", borderTop: "720px solid rgba(196,146,42,0.022)", filter: "blur(22px)" }} />
      <motion.div
        className="absolute top-0 left-0 right-0"
        style={{ height: 720, background: "radial-gradient(ellipse 38% 100% at 50% 0%, rgba(196,146,42,0.038) 0%, transparent 100%)" }}
        animate={{ opacity: [1, 0.65, 1, 0.8, 1] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ─── Live counter ─────────────────────────────────────────────────────────────
function LiveCounter() {
  const [count, setCount] = useState(482391);
  useEffect(() => {
    const t = setInterval(() => setCount(c => c + Math.floor(Math.random() * 3) + 1), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2">
      <motion.div animate={{ scale: [1, 1.7, 1], opacity: [1, 0.25, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
      <span className="text-xs font-bold tabular-nums" style={{ color: "var(--cream)" }}>{count.toLocaleString()}</span>
      <span className="text-xs" style={{ color: "var(--secondary-foreground)" }}>productions created</span>
    </div>
  );
}

// ─── Gold divider ─────────────────────────────────────────────────────────────
function GoldDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, transparent, var(--gold-border))" }} />
      <span className="text-[0.45rem]" style={{ color: "var(--gold)" }}>✦</span>
      <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, var(--gold-border), transparent)" }} />
    </div>
  );
}

// ─── Film-frame section divider ───────────────────────────────────────────────
function FilmDivider({ number, label }: { number: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
      viewport={{ once: true }} transition={{ duration: 0.6 }}
      className="flex items-center gap-4 py-8"
    >
      {/* Film holes */}
      <div className="flex gap-1 shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-5 h-8 rounded-[3px]" style={{ border: "1px solid rgba(196,146,42,0.18)" }} />
        ))}
      </div>
      <div className="h-px flex-1" style={{ background: "linear-gradient(90deg, var(--gold-border), transparent 80%)" }} />
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-display text-[0.5rem] tracking-[0.4em] uppercase" style={{ color: "var(--gold)", opacity: 0.5 }}>{number}</span>
        <div className="w-1 h-1 rounded-full" style={{ background: "var(--gold)", opacity: 0.4 }} />
        <span className="font-display text-[0.5rem] tracking-[0.3em] uppercase" style={{ color: "var(--secondary-foreground)", opacity: 0.5 }}>{label}</span>
      </div>
      <div className="h-px w-12" style={{ background: "var(--gold-border)" }} />
      <div className="flex gap-1 shrink-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-5 h-8 rounded-[3px]" style={{ border: "1px solid rgba(196,146,42,0.18)" }} />
        ))}
      </div>
    </motion.div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-display text-[0.5625rem] font-bold tracking-[0.38em] uppercase mb-5" style={{ color: "var(--gold)" }}>
      {children}
    </p>
  );
}

// ─── Scroll reveal ────────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, clipPath: "inset(0 0 100% 0)" }}
      whileInView={{ opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const PRODUCTION_SUITE = [
  {
    phase: "I", title: "Development", sub: "AI Script Writing",
    body: "Our AI develops compelling scripts for any niche — mythology, horror, finance, history — with narrative structure and viral hooks built in.",
    accent: "#c4922a",
  },
  {
    phase: "II", title: "Production", sub: "Voice · Visuals · Captions",
    body: "Studio-quality AI voiceover, cinematic visuals matched scene by scene, and word-by-word caption styles that audiences can't stop watching.",
    accent: "#9333ea",
  },
  {
    phase: "III", title: "Distribution", sub: "Render · Export · Publish",
    body: "Full 1080×1920 HD render in under 5 minutes. Download and publish directly to TikTok, Instagram Reels, and YouTube Shorts.",
    accent: "#6366f1",
  },
];

const CAPABILITIES = [
  { label: "Niches", value: "50+" }, { label: "AI Voices", value: "50+" },
  { label: "Caption Styles", value: "10+" }, { label: "Render Time", value: "< 5 min" },
  { label: "Output", value: "1080p" }, { label: "Platforms", value: "3 major" },
];

const PRICING = [
  {
    tier: "INDIE", price: "$0", period: "forever", tagline: "Begin your story.",
    features: ["3 productions / month", "All niches & styles", "HD output", "Styled captions", "Manual export"],
    cta: "Start Free", highlighted: false, variant: "outline" as const,
  },
  {
    tier: "STUDIO", price: "$19", period: "/ month", tagline: "Build your audience.",
    features: ["30 productions / month", "All niches & art styles", "HD output", "All caption styles", "Priority rendering", "Email support"],
    cta: "Enter the Studio", highlighted: true, variant: "primary" as const,
  },
  {
    tier: "PREMIERE", price: "$49", period: "/ month", tagline: "Dominate your niche.",
    features: ["100 productions / month", "All niches & art styles", "HD output", "All caption styles", "Priority rendering", "Custom voice uploads", "Dedicated support"],
    cta: "Go Premiere", highlighted: false, variant: "outline" as const,
  },
];

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} style={{ color: "var(--gold)" }}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [ready, setReady] = useState(false);

  const { scrollY } = useScroll();
  const heroYRaw = useTransform(scrollY, [0, 800], [0, 160]);
  const heroY = useSpring(heroYRaw, { stiffness: 70, damping: 18 });
  const heroOpacity = useTransform(scrollY, [0, 550], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 700], [1, 0.94]);

  return (
    <div className="min-h-screen" style={{ background: "var(--background)" }}>
      <GrainOverlay />
      <CustomCursor />
      <SpotlightCursor />
      <StudioIntro onDone={() => setReady(true)} />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: ready ? 1 : 0 }} transition={{ duration: 1, ease: "easeOut" }}>

        {/* ── Ticker strip ── */}
        <div className="fixed top-0 left-0 right-0 z-40 overflow-hidden flex items-center"
          style={{ height: 26, background: "rgba(8,6,10,0.98)", borderBottom: "1px solid rgba(196,146,42,0.18)" }}>
          <div className="flex items-center animate-ticker whitespace-nowrap">
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className="flex items-center gap-5 px-5">
                <span className="font-display text-[0.5rem] font-bold tracking-[0.42em] uppercase" style={{ color: "var(--gold)" }}>AI PRODUCTION STUDIO</span>
                <span style={{ color: "var(--gold-border)" }}>✦</span>
                <span className="font-display text-[0.5rem] tracking-[0.42em] uppercase" style={{ color: "rgba(196,146,42,0.4)" }}>NOW ROLLING</span>
                <span style={{ color: "var(--gold-border)" }}>✦</span>
                <span className="font-display text-[0.5rem] tracking-[0.42em] uppercase" style={{ color: "rgba(196,146,42,0.4)" }}>FACELESS STUDIOS</span>
                <span style={{ color: "var(--gold-border)" }}>✦</span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Nav ── */}
        <nav className="fixed z-50 glass"
          style={{ top: 26, left: 0, right: 0, height: 62, borderBottom: "1px solid rgba(196,146,42,0.1)", background: "rgba(8,6,10,0.88)" }}>
          <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)" }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: "var(--gold)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <span className="font-display text-sm font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--cream)" }}>Faceless</span>
            </Link>

            <div className="hidden md:flex items-center gap-1">
              {[["The Studio", "#studio"], ["Productions", "#productions"], ["Pricing", "#pricing"]].map(([label, href]) => (
                <a key={label} href={href}
                  className="px-4 py-2 text-[0.6875rem] font-semibold tracking-widest uppercase transition-colors duration-200 rounded-lg"
                  style={{ color: "var(--secondary-foreground)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--gold)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--secondary-foreground)")}
                >{label}</a>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Link href="/auth/signin"><Button variant="ghost" size="sm">Sign In</Button></Link>
              <MagneticWrap>
                <Link href="/auth/signin">
                  <Button size="sm" className="font-display tracking-widest text-[0.6875rem] uppercase"
                    style={{ background: "var(--gold)", color: "#08060a", border: "none" }}>
                    Get Started
                  </Button>
                </Link>
              </MagneticWrap>
            </div>
          </div>
        </nav>

        {/* ══════════════════════════════ HERO ══════════════════════════════ */}
        <section className="relative overflow-hidden bg-cinema" style={{ minHeight: "100svh", paddingTop: 88 }}>
          <ParticleCanvas />
          <FloatingShapes />
          <ProjectorBeam />

          {/* Gold dust */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[6, 14, 23, 34, 47, 56, 65, 73, 82, 91].map((l, i) => (
              <DustParticle key={i} left={`${l}%`} delay={i} />
            ))}
          </div>

          {/* Letterbox bars */}
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
            transition={{ duration: 1.4, ease: [0.76, 0, 0.24, 1] }}
            className="absolute origin-left pointer-events-none z-20"
            style={{ top: 88, left: 0, right: 0, height: "clamp(16px, 2.8vw, 38px)", background: "#000" }} />
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
            transition={{ duration: 1.4, ease: [0.76, 0, 0.24, 1], delay: 0.07 }}
            className="absolute bottom-0 left-0 right-0 origin-right pointer-events-none z-20"
            style={{ height: "clamp(16px, 2.8vw, 38px)", background: "#000" }} />

          {/* Vignette */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 110% 100% at 50% 50%, transparent 35%, rgba(0,0,0,0.62) 100%)" }} />
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: 280, background: "linear-gradient(to bottom, transparent, var(--background))" }} />

          {/* Parallax content */}
          <motion.div
            className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col justify-center"
            style={{ minHeight: "calc(100svh - 88px)", paddingTop: "clamp(48px, 6vw, 80px)", paddingBottom: 80, y: heroY, opacity: heroOpacity, scale: heroScale }}>

            {/* Top meta */}
            <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="flex items-center justify-between flex-wrap gap-4 mb-10">
              <div className="flex items-center gap-3">
                <motion.div animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 3.5, repeat: Infinity }}
                  className="font-display text-[0.5625rem] tracking-[0.38em] uppercase font-bold" style={{ color: "var(--gold)" }}>
                  ✦ A Faceless Production
                </motion.div>
                <div className="w-px h-3" style={{ background: "var(--gold-border)" }} />
                <span className="text-[0.5625rem] tracking-widest uppercase font-semibold" style={{ color: "var(--secondary-foreground)" }}>AI Content Studio</span>
              </div>
              <LiveCounter />
            </motion.div>

            {/* ── MASSIVE HEADLINE ── */}
            <div className="mb-8">
              {/* Line 1 — scramble on load */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
                <h1 className="font-display font-black leading-[0.88] tracking-[-0.02em] mb-1"
                  style={{ fontSize: "clamp(3.8rem, 11.5vw, 10.5rem)", color: "var(--cream)" }}>
                  <ScrambleText text="THE AI STUDIO" delay={0.4} className="block" />
                </h1>
              </motion.div>

              {/* Line 2 — gold shimmer */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
                <h1 className="font-display font-black leading-[0.88] tracking-[-0.02em] mb-1 animate-shimmer-gold"
                  style={{ fontSize: "clamp(3.8rem, 11.5vw, 10.5rem)" }}>
                  <ScrambleText text="THAT NEVER" delay={0.6} />
                </h1>
              </motion.div>

              {/* Line 3 — very dim */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }}>
                <h1 className="font-display font-black leading-[0.88] tracking-[-0.02em]"
                  style={{ fontSize: "clamp(3.8rem, 11.5vw, 10.5rem)", color: "var(--cream)", opacity: 0.28 }}>
                  <ScrambleText text="STOPS ROLLING." delay={0.8} />
                </h1>
              </motion.div>
            </div>

            {/* Animated divider */}
            <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
              transition={{ duration: 1.1, delay: 1, ease: [0.76, 0, 0.24, 1] }}
              className="max-w-sm mb-7 origin-left">
              <GoldDivider />
            </motion.div>

            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.05 }}
              className="text-lg md:text-xl leading-relaxed max-w-lg mb-10"
              style={{ color: "var(--secondary-foreground)" }}>
              The AI production studio that writes, records, edits, and renders cinematic short-form videos for any niche — fully automated, under 5 minutes.
            </motion.p>

            {/* CTAs */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1.12 }}
              className="flex flex-wrap items-center gap-4 mb-14">
              <MagneticWrap>
                <Link href="/auth/signin">
                  <Button size="lg" className="font-display tracking-widest text-xs uppercase"
                    style={{ background: "var(--gold)", color: "#08060a", border: "none", boxShadow: "0 0 40px rgba(196,146,42,0.32), 0 0 90px rgba(196,146,42,0.1)" }}>
                    Open Your Studio
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </Button>
                </Link>
              </MagneticWrap>
              <MagneticWrap>
                <a href="#productions">
                  <Button variant="outline" size="lg" className="font-display tracking-widest text-xs uppercase"
                    style={{ borderColor: "var(--gold-border)", color: "var(--gold)" }}>
                    Watch the Reel
                  </Button>
                </a>
              </MagneticWrap>
            </motion.div>

            {/* Genre tags */}
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ duration: 0.9, delay: 1.2 }}
              className="flex flex-wrap gap-2 mb-14">
              {["Horror", "Mythology", "True Crime", "Action", "Drama", "Sci-Fi", "Finance", "History", "Comedy"].map((g, i) => (
                <motion.span key={g}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.25 + i * 0.055 }}
                  whileHover={{ borderColor: "rgba(196,146,42,0.5)", scale: 1.04 }}
                  className="font-display text-[0.5625rem] tracking-[0.25em] uppercase px-3.5 py-1.5 rounded-full"
                  style={{ background: "rgba(196,146,42,0.04)", border: "1px solid var(--gold-border)", color: "rgba(196,146,42,0.55)", transition: "border-color 0.2s, transform 0.2s" }}>
                  {g}
                </motion.span>
              ))}
            </motion.div>

            {/* Interactive demo */}
            <motion.div initial={{ opacity: 0, y: 28 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 1.35 }} className="max-w-2xl">
              <NichePicker />
            </motion.div>
          </motion.div>
        </section>

        {/* ══════════════════════════════ STATS ══════════════════════════════ */}
        <section style={{ borderTop: "1px solid var(--gold-border)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="max-w-5xl mx-auto px-6 py-11 grid grid-cols-2 md:grid-cols-4 gap-8">
            <AnimatedStat raw="10000" suffix="+" displayValue="10,000+" label="Active creators" />
            <AnimatedStat raw="500000" suffix="+" displayValue="500K+" label="Productions made" />
            <AnimatedStat raw="5" prefix="< " suffix=" min" label="Per production" />
            <AnimatedStat raw="3" suffix=" platforms" label="Supported" />
          </div>
        </section>

        {/* ══════════════════════════════ FILM SHOWCASE ══════════════════════════════ */}
        <FilmDivider number="001" label="The AI Cinema" />
        <section id="productions" className="pb-24">
          <div className="max-w-7xl mx-auto">
            <div className="px-6 mb-2">
              <SectionLabel>Now Playing</SectionLabel>
              <Reveal>
                <h2 className="font-display font-black mb-4"
                  style={{ fontSize: "clamp(2rem, 5.5vw, 4.5rem)", color: "var(--cream)", letterSpacing: "-0.015em", lineHeight: 0.95 }}>
                  <ScrambleText text="WHAT CREATORS" />
                  <br />
                  <span className="animate-shimmer-gold">
                    <ScrambleText text="ARE MAKING." delay={0.2} />
                  </span>
                </h2>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="text-sm max-w-md mb-10" style={{ color: "var(--secondary-foreground)" }}>
                  Real AI-generated films from independent creators. Grayscale reveals color on hover. Click to play.
                </p>
              </Reveal>
            </div>
            <FilmShowcase />
          </div>
        </section>

        {/* ══════════════════════════════ PRODUCTION SUITE ══════════════════════════════ */}
        <FilmDivider number="002" label="The Production Suite" />
        <section id="studio" className="pb-28 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-16">
              <SectionLabel>The Studio</SectionLabel>
              <h2 className="font-display font-black"
                style={{ fontSize: "clamp(2rem, 5.5vw, 4.5rem)", color: "var(--cream)", letterSpacing: "-0.015em", lineHeight: 0.95 }}>
                <ScrambleText text="A FULL STUDIO" />
                <br />
                <span className="animate-shimmer-gold">
                  <ScrambleText text="IN YOUR BROWSER." delay={0.15} />
                </span>
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-5 mb-14">
              {PRODUCTION_SUITE.map((phase, i) => (
                <Reveal key={phase.phase} delay={i * 0.1}>
                  <motion.div
                    whileHover={{ y: -8, borderColor: phase.accent + "50" }}
                    transition={{ duration: 0.3 }}
                    className="rounded-2xl p-7 relative overflow-hidden h-full"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <div className="font-display text-[5.5rem] font-black leading-none absolute top-0 right-3 opacity-[0.055] select-none" style={{ color: phase.accent }}>
                      {phase.phase}
                    </div>
                    <div className="w-8 h-0.5 rounded-full mb-5" style={{ background: phase.accent }} />
                    <p className="font-display text-[0.5625rem] tracking-[0.32em] uppercase mb-2 font-bold" style={{ color: phase.accent }}>{phase.sub}</p>
                    <h3 className="font-display text-xl font-bold mb-3" style={{ color: "var(--cream)", letterSpacing: "0.02em" }}>{phase.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--secondary-foreground)" }}>{phase.body}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>

            <GoldDivider className="mb-10" />
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {CAPABILITIES.map((c, i) => (
                <Reveal key={c.label} delay={i * 0.06}>
                  <motion.div whileHover={{ scale: 1.05, borderColor: "var(--gold-border)" }}
                    transition={{ duration: 0.2 }}
                    className="text-center rounded-xl py-4 px-2"
                    style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                    <p className="font-display text-base font-bold mb-1 animate-shimmer-gold">{c.value}</p>
                    <p className="text-[0.5625rem] font-semibold tracking-wider uppercase" style={{ color: "var(--muted-foreground)" }}>{c.label}</p>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════ CRITICAL ACCLAIM ══════════════════════════════ */}
        <FilmDivider number="003" label="Critical Acclaim" />
        <section style={{ paddingBottom: 80 }}>
          <div className="max-w-6xl mx-auto px-6 mb-10">
            <SectionLabel>Audience Reviews</SectionLabel>
            <h2 className="font-display font-black"
              style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: "var(--cream)", letterSpacing: "-0.015em", lineHeight: 0.95 }}>
              <ScrambleText text="THE CRITICS HAVE" />
              <br />
              <span className="animate-shimmer-gold">
                <ScrambleText text="SPOKEN." delay={0.12} />
              </span>
            </h2>
          </div>
          <TestimonialTicker />
        </section>

        {/* ══════════════════════════════ LIVE DEMO ══════════════════════════════ */}
        <FilmDivider number="004" label="Live Demo" />
        <section className="pb-28 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="mb-12">
              <SectionLabel>Interactive Preview</SectionLabel>
              <h2 className="font-display font-black"
                style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: "var(--cream)", letterSpacing: "-0.015em", lineHeight: 0.95 }}>
                <ScrambleText text="WATCH THE AI" />
                <br />
                <span className="animate-shimmer-gold">
                  <ScrambleText text="WORK IN REAL TIME." delay={0.14} />
                </span>
              </h2>
            </div>
            <NichePicker />
          </div>
        </section>

        {/* ══════════════════════════════ PRICING ══════════════════════════════ */}
        <FilmDivider number="005" label="Studio Tiers" />
        <section id="pricing" className="pb-28 px-6">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <SectionLabel>Choose Your Level</SectionLabel>
              <h2 className="font-display font-black mb-5"
                style={{ fontSize: "clamp(2rem, 5vw, 4rem)", color: "var(--cream)", letterSpacing: "-0.015em", lineHeight: 0.95 }}>
                <ScrambleText text="PICK YOUR PRODUCTION TIER." />
              </h2>
              <GoldDivider className="max-w-xs mx-auto" />
            </div>

            <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
              {PRICING.map((plan, i) => (
                <Reveal key={plan.tier} delay={i * 0.1}>
                  <motion.div
                    whileHover={plan.highlighted ? {} : { y: -6 }}
                    transition={{ duration: 0.3 }}
                    className={`relative rounded-2xl p-7 flex flex-col ${plan.highlighted ? "glow-gold" : ""}`}
                    style={{ background: plan.highlighted ? "rgba(196,146,42,0.05)" : "var(--surface)", border: plan.highlighted ? "1px solid var(--gold-border)" : "1px solid var(--border)" }}>
                    {plan.highlighted && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <span className="font-display text-[0.5625rem] px-3 py-1 rounded-full font-bold tracking-widest uppercase"
                          style={{ background: "var(--gold)", color: "#08060a" }}>Most Popular</span>
                      </div>
                    )}
                    <p className="font-display text-[0.5625rem] tracking-[0.38em] uppercase font-bold mb-2 animate-shimmer-gold">{plan.tier}</p>
                    <p className="text-xs italic mb-4" style={{ color: "var(--secondary-foreground)" }}>{plan.tagline}</p>
                    <div className="flex items-baseline gap-1 mb-6">
                      <span className="font-display text-4xl font-black" style={{ color: "var(--cream)" }}>{plan.price}</span>
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{plan.period}</span>
                    </div>
                    <ul className="space-y-2.5 mb-8 flex-1">
                      {plan.features.map(f => (
                        <li key={f} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--secondary-foreground)" }}>
                          <CheckIcon />{f}
                        </li>
                      ))}
                    </ul>
                    <MagneticWrap>
                      <Link href="/auth/signin" className="block">
                        <Button variant={plan.variant} className="w-full font-display tracking-widest text-xs uppercase"
                          style={plan.highlighted ? { background: "var(--gold)", color: "#08060a", border: "none" } : undefined}>
                          {plan.cta}
                        </Button>
                      </Link>
                    </MagneticWrap>
                  </motion.div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════ FINAL CTA ══════════════════════════════ */}
        <FilmDivider number="006" label="The Final Scene" />
        <section className="relative overflow-hidden" style={{ paddingTop: 80, paddingBottom: 120, paddingLeft: 24, paddingRight: 24 }}>
          <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 50% 55% at 50% 100%, rgba(196,146,42,0.09) 0%, transparent 65%)" }} />
          <div className="absolute top-0 left-0 right-0 pointer-events-none" style={{ height: "clamp(16px, 2.8vw, 38px)", background: "#000" }} />
          <div className="absolute bottom-0 left-0 right-0 pointer-events-none" style={{ height: "clamp(16px, 2.8vw, 38px)", background: "#000" }} />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[8, 22, 38, 52, 65, 80].map((l, i) => <DustParticle key={i} left={`${l}%`} delay={i * 1.6} />)}
          </div>

          <div className="relative max-w-3xl mx-auto text-center">
            <motion.p initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="font-display text-[0.5625rem] tracking-[0.42em] uppercase mb-8" style={{ color: "var(--gold)" }}>
              ✦ Production Starts Now ✦
            </motion.p>

            <Reveal>
              <h2 className="font-display font-black leading-[0.9] mb-7"
                style={{ fontSize: "clamp(2.5rem, 7vw, 5.5rem)", color: "var(--cream)" }}>
                <ScrambleText text="YOUR VIRAL VIDEO" />
                <br />
                <span className="animate-shimmer-gold">
                  <ScrambleText text="IS 5 MINUTES AWAY." delay={0.16} />
                </span>
              </h2>
            </Reveal>

            <motion.div initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }}
              viewport={{ once: true }} transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
              className="max-w-xs mx-auto mb-8 origin-center">
              <GoldDivider />
            </motion.div>

            <Reveal delay={0.1}>
              <p className="text-base mb-10" style={{ color: "var(--secondary-foreground)" }}>
                No face. No crew. No editing skills required.
                <br />Just your story — and an AI production studio.
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <MagneticWrap>
                  <Link href="/auth/signin">
                    <Button size="lg" className="min-w-[240px] font-display tracking-widest text-xs uppercase"
                      style={{ background: "var(--gold)", color: "#08060a", border: "none", boxShadow: "0 0 55px rgba(196,146,42,0.38), 0 0 110px rgba(196,146,42,0.14)" }}>
                      Open Your Studio
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </Button>
                  </Link>
                </MagneticWrap>
                <p className="font-display text-[0.625rem] tracking-widest uppercase" style={{ color: "var(--muted-foreground)" }}>Free · No card needed</p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="py-10 px-6" style={{ borderTop: "1px solid rgba(196,146,42,0.15)" }}>
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "var(--gold-muted)", border: "1px solid var(--gold-border)" }}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} style={{ color: "var(--gold)" }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
              </div>
              <span className="font-display text-xs tracking-[0.15em] uppercase" style={{ color: "var(--cream)", opacity: 0.55 }}>Faceless Studios</span>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>&copy; {new Date().getFullYear()}</span>
            </div>
            <div className="flex items-center gap-6">
              {["Terms", "Privacy", "Contact"].map(item => (
                <a key={item} href="#"
                  className="font-display text-[0.625rem] tracking-widest uppercase transition-colors duration-200"
                  style={{ color: "var(--muted-foreground)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--gold)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                  {item}
                </a>
              ))}
            </div>
          </div>
        </footer>

      </motion.div>
    </div>
  );
}
