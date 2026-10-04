"use client";

import { m, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";

const spring = { stiffness: 120, damping: 30, mass: 0.4 };

export function HeroScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const progress = useSpring(scrollYProgress, spring);
  const rotateX = useTransform(progress, [0, 1], [0, 8]);
  const scale = useTransform(progress, [0, 1], [1, 0.94]);
  const y = useTransform(progress, [0, 1], [0, -40]);
  const opacity = useTransform(progress, [0, 1], [1, 0.6]);

  if (reduce) return <div>{children}</div>;

  return (
    <div ref={ref} style={{ perspective: 1200 }}>
      <m.div
        style={{
          rotateX,
          scale,
          y,
          opacity,
          transformOrigin: "50% 100%",
          willChange: "transform",
        }}
      >
        {children}
      </m.div>
    </div>
  );
}
