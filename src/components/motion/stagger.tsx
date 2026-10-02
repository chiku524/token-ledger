"use client";

import { m, type Variants } from "motion/react";
import { easeOut } from "@/components/motion/fade-in";

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.2, ease: easeOut } },
};

/** Staggers its `StaggerItem` children in on mount. Use for short groups (about 8 items or fewer). */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div className={className} variants={container} initial="hidden" animate="show">
      {children}
    </m.div>
  );
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <m.div className={className} variants={item}>
      {children}
    </m.div>
  );
}
