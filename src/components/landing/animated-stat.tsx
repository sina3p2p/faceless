"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedStatProps {
  raw: string;   // e.g. "10000+", "500000+", "5"
  label: string;
  prefix?: string;  // e.g. "< "
  suffix?: string;  // e.g. "+" or "K+"
  displayValue?: string; // override final display e.g. "10,000+"
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export function AnimatedStat({ raw, label, prefix = "", suffix = "", displayValue }: AnimatedStatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState("0");
  const animated = useRef(false);

  const target = parseInt(raw.replace(/\D/g, ""), 10) || 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          const duration = 1600;
          const startTime = performance.now();

          const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = easeOutCubic(progress);
            const current = Math.round(eased * target);

            setShown(current >= 1000 ? current.toLocaleString() : String(current));

            if (progress < 1) {
              requestAnimationFrame(tick);
            } else {
              setShown(displayValue ?? (target >= 1000 ? target.toLocaleString() : String(target)));
            }
          };

          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [target, displayValue]);

  return (
    <div ref={ref} className="text-center">
      <p className="text-2xl font-bold text-white tracking-tight tabular-nums">
        {prefix}{shown}{suffix}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
    </div>
  );
}
