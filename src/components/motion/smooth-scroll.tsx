"use client";

import "lenis/dist/lenis.css";
import { ReactLenis } from "lenis/react";
import { useReducedMotion } from "motion/react";

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.1, anchors: { offset: -72 }, syncTouch: false }}>
      {children}
    </ReactLenis>
  );
}
