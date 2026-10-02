"use client";

import { m } from "motion/react";

export const easeOut = [0.22, 1, 0.36, 1] as const;

/** Fade and rise on mount. Reduced-motion users get the fade only (see MotionProvider). */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: easeOut, delay }}
    >
      {children}
    </m.div>
  );
}

/** Wrap a route's content for the standard page fade. Mount it from a `template.tsx` so it replays on navigation. */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return <FadeIn className={className}>{children}</FadeIn>;
}
