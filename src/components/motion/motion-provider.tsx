"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";

/**
 * App-wide motion settings. `LazyMotion` keeps the animation bundle small (use
 * the `m.*` components, not `motion.*`), and `reducedMotion="user"` makes every
 * animation respect the OS "reduce motion" setting. See docs/design-system/motion.md.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
