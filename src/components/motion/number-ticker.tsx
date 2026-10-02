"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Counts up to `value` on first render. The server renders the final figure, so
 * there is no layout shift and it reads correctly without JavaScript or with
 * reduced motion. Props are plain values so it can be used from server components.
 */
export function NumberTicker({
  value,
  currency,
  minimumFractionDigits,
  maximumFractionDigits,
  locale = "en-US",
  duration = 0.6,
  className,
}: {
  value: number;
  currency?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  locale?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const format = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: currency ? "currency" : "decimal",
        currency,
        minimumFractionDigits,
        maximumFractionDigits,
      }),
    [locale, currency, minimumFractionDigits, maximumFractionDigits],
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || reduce) return;
    const controls = animate(0, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => {
        node.textContent = format.format(latest);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduce, format]);

  return (
    <span ref={ref} className={cn("font-mono tabular-nums", className)}>
      {format.format(value)}
    </span>
  );
}
