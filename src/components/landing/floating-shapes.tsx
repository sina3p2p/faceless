"use client";

import { motion } from "framer-motion";

interface ShapeProps {
  className?: string;
  delay?: number;
  width?: number;
  height?: number;
  rotate?: number;
  gradient?: string;
}

function ElegantShape({ className = "", delay = 0, width = 400, height = 100, rotate = 0, gradient = "from-indigo-500/[0.12]" }: ShapeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -120, rotate: rotate - 18 }}
      animate={{ opacity: 1, y: 0, rotate }}
      transition={{
        duration: 2.6,
        delay,
        ease: [0.23, 0.86, 0.39, 0.96],
        opacity: { duration: 1.4 },
      }}
      className={`absolute ${className}`}
    >
      <motion.div
        animate={{ y: [0, 18, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        style={{ width, height }}
        className="relative"
      >
        <div
          className={`absolute inset-0 rounded-full bg-gradient-to-r to-transparent ${gradient} backdrop-blur-[2px] border border-white/[0.08] shadow-[0_8px_32px_0_rgba(99,102,241,0.07)] after:absolute after:inset-0 after:rounded-full after:bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.06),transparent_70%)]`}
        />
      </motion.div>
    </motion.div>
  );
}

export function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <ElegantShape
        delay={0.3}
        width={660}
        height={130}
        rotate={12}
        gradient="from-indigo-500/[0.13]"
        className="left-[-10%] top-[16%]"
      />
      <ElegantShape
        delay={0.5}
        width={530}
        height={110}
        rotate={-15}
        gradient="from-violet-500/[0.10]"
        className="right-[-5%] top-[65%]"
      />
      <ElegantShape
        delay={0.4}
        width={290}
        height={75}
        rotate={-8}
        gradient="from-purple-500/[0.09]"
        className="left-[6%] bottom-[6%]"
      />
      <ElegantShape
        delay={0.65}
        width={210}
        height={55}
        rotate={22}
        gradient="from-indigo-400/[0.10]"
        className="right-[16%] top-[10%]"
      />
      <ElegantShape
        delay={0.75}
        width={150}
        height={42}
        rotate={-28}
        gradient="from-cyan-500/[0.07]"
        className="left-[20%] top-[4%]"
      />
    </div>
  );
}
