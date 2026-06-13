"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface FeatureCard3DProps {
  icon: ReactNode;
  title: string;
  description: string;
  index?: number;
}

export function FeatureCard3D({ icon, title, description, index = 0 }: FeatureCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const rotateX = useSpring(useTransform(rawY, [-0.5, 0.5], [9, -9]), {
    stiffness: 280,
    damping: 28,
  });
  const rotateY = useSpring(useTransform(rawX, [-0.5, 0.5], [-9, 9]), {
    stiffness: 280,
    damping: 28,
  });

  const glareX = useTransform(rawX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(rawY, [-0.5, 0.5], [0, 100]);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    rawX.set((e.clientX - rect.left) / rect.width - 0.5);
    rawY.set((e.clientY - rect.top) / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rawX.set(0);
    rawY.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        duration: 0.65,
        delay: index * 0.08,
        ease: [0.25, 0.4, 0.25, 1],
      }}
      style={{ perspective: 900 }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className="group select-none"
    >
      <motion.div
        animate={{ y: isHovered ? -6 : 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative rounded-2xl p-6 overflow-hidden"
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
          border: isHovered ? "1px solid rgba(99,102,241,0.38)" : "1px solid rgba(255,255,255,0.08)",
          background: isHovered ? "rgba(255,255,255,0.055)" : "rgba(255,255,255,0.028)",
          transition: "border-color 0.2s ease, background 0.2s ease",
        }}
      >
        {/* Mouse-tracked glare */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            background: useTransform(
              [glareX, glareY],
              ([x, y]) =>
                `radial-gradient(circle at ${x}% ${y}%, rgba(255,255,255,0.09) 0%, transparent 55%)`
            ),
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.2s ease",
          }}
        />

        {/* Subtle edge highlight on hover */}
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 50%)",
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />

        {/* Icon chip — rises with translateZ for 3D depth */}
        <motion.div
          className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 text-indigo-400"
          style={{
            background: "rgba(99,102,241,0.1)",
            border: "1px solid rgba(99,102,241,0.2)",
            translateZ: isHovered ? 28 : 0,
            transition: "transform 0.3s ease",
          }}
        >
          {icon}
        </motion.div>

        <motion.h3
          className="text-[0.9375rem] font-semibold text-white mb-2 tracking-tight"
          style={{
            translateZ: isHovered ? 16 : 0,
            transition: "transform 0.3s ease",
          }}
        >
          {title}
        </motion.h3>

        <motion.p
          className="text-sm leading-relaxed"
          style={{
            color: "var(--secondary-foreground)",
            translateZ: isHovered ? 10 : 0,
            transition: "transform 0.3s ease",
          }}
        >
          {description}
        </motion.p>

        {/* Bottom shimmer line */}
        <motion.div
          className="absolute bottom-0 left-4 right-4 h-px"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)",
            opacity: isHovered ? 1 : 0,
            transition: "opacity 0.3s ease",
          }}
        />
      </motion.div>
    </motion.div>
  );
}
