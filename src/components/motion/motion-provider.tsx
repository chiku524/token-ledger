"use client";

import { LazyMotion, MotionConfig, domMax } from "motion/react";

/**
 * App-wide motion settings. `LazyMotion` loads the features lazily (use the
 * `m.*` components, not `motion.*`), and `reducedMotion="user"` makes every
 * animation respect the OS "reduce motion" setting. See docs/design-system/motion.md.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domMax}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
