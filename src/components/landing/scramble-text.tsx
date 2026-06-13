"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789▓░▒█▄▀■□◆◇";

interface ScrambleTextProps {
  text: string;
  delay?: number;
  speed?: number;
  className?: string;
  once?: boolean;
}

export function ScrambleText({
  text,
  delay = 0,
  speed = 22,
  className = "",
  once = true,
}: ScrambleTextProps) {
  const [output, setOutput] = useState<string[]>(() =>
    text.split("").map((c) => (c === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]))
  );
  const elRef = useRef<HTMLSpanElement>(null);
  const done = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || (once && done.current)) return;
        done.current = true;

        const delayMs = delay * 1000;
        const letters = text.split("");

        const start = () => {
          let progress = 0;

          intervalRef.current = setInterval(() => {
            setOutput(
              letters.map((char, i) => {
                if (char === " ") return " ";
                if (i < progress) return char;
                return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
              })
            );
            progress += 0.5;
            if (progress >= letters.length) {
              clearInterval(intervalRef.current!);
              setOutput(letters);
            }
          }, speed);
        };

        if (delayMs > 0) setTimeout(start, delayMs);
        else start();
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, delay, speed, once]);

  return (
    <span ref={elRef} className={className} aria-label={text}>
      {output.map((char, i) => (
        <span
          key={i}
          style={{
            opacity: char !== text[i] && char !== " " ? 0.35 : 1,
            transition: "opacity 0.05s",
            display: "inline-block",
            width: char === " " ? "0.28em" : undefined,
          }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
