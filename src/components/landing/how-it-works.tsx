"use client";

import { BarChart3, FileCheck2, Link2, type LucideIcon } from "lucide-react";
import { type MotionValue, m, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { content } from "@/components/landing/content";
import { Reveal } from "@/components/motion/reveal";
import { useScrollLive } from "@/components/motion/use-scroll-live";
import { cn } from "@/lib/utils";

const icons: LucideIcon[] = [Link2, FileCheck2, BarChart3];
const STARTS = [0.04, 0.4, 0.74];
const WINDOW = 0.14;
const spring = { stiffness: 140, damping: 30, mass: 0.4 };

function useRise(progress: MotionValue<number>, start: number) {
  const t = useTransform(progress, [start, start + WINDOW], [0, 1]);
  const opacity = useTransform(t, [0, 1], [0.3, 1]);
  const y = useTransform(t, [0, 1], [14, 0]);
  return { t, opacity, y };
}

function Step({ index, progress, live }: { index: number; progress: MotionValue<number>; live: boolean }) {
  const step = content.steps[index];
  const Icon = icons[index];
  const accent = index === 1;
  const start = STARTS[index];
  const tile = useRise(progress, start);
  const number = useRise(progress, start + 0.02);
  const title = useRise(progress, start + 0.04);
  const body = useRise(progress, start + 0.06);
  const tileScale = useTransform(tile.t, [0, 1], [0.88, 1]);
  const rise = (value: { opacity: MotionValue<number>; y: MotionValue<number> }) =>
    live ? { opacity: value.opacity, y: value.y } : undefined;

  return (
    <div className="relative flex gap-5 border-b pb-8 last:border-0 last:pb-0 md:border-r md:border-b-0 md:px-7 md:pb-0 md:first:pl-0 md:last:border-r-0 md:last:pr-0">
      <m.div className="relative z-10 size-14 shrink-0" style={live ? { scale: tileScale } : undefined}>
        <div className="flex size-full items-center justify-center rounded-xl border bg-muted text-muted-foreground">
          <Icon strokeWidth={1.7} className="size-6" aria-hidden />
        </div>
        <m.div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-xl",
            accent ? "bg-primary text-primary-foreground" : "bg-brand text-brand-foreground",
          )}
          style={live ? { opacity: tile.t } : undefined}
        >
          <Icon strokeWidth={1.7} className="size-6" aria-hidden />
        </m.div>
      </m.div>
      <div>
        <m.p
          className={cn("mb-1 font-mono text-sm", accent ? "text-brand dark:text-primary" : "text-link")}
          style={rise(number)}
        >
          0{index + 1}
        </m.p>
        <m.h3 className="text-2xl font-semibold tracking-tight" style={rise(title)}>
          {step.title}
        </m.h3>
        <m.p className="mt-3 text-[13px] leading-7 text-muted-foreground" style={rise(body)}>
          {step.description}
        </m.p>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const live = useScrollLive();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.7"] });
  const progress = useSpring(scrollYProgress, spring);
  const headLeft = useTransform(progress, (value) => `${value * 100}%`);

  return (
    <section id="how-it-works" className="page-width scroll-mt-24 py-16 sm:py-20">
      <Reveal>
        <p className="eyebrow mb-4">From holdings to reports</p>
        <h2 className="section-title">{content.workflowTitle}</h2>
      </Reveal>
      <div ref={ref} className="relative mt-10">
        <div aria-hidden className="relative hidden h-px bg-border md:block">
          <m.div
            className="absolute inset-0 origin-left bg-brand dark:bg-primary"
            style={{ scaleX: live ? progress : 1 }}
          />
          {live && (
            <m.span
              className="absolute -top-[5px] -ml-[5px] size-2.5 rounded-full bg-brand ring-4 ring-background dark:bg-primary"
              style={{ left: headLeft }}
            />
          )}
        </div>
        <div aria-hidden className="absolute top-7 bottom-7 left-7 w-px bg-border md:hidden">
          <m.div
            className="absolute inset-0 origin-top bg-brand dark:bg-primary"
            style={{ scaleY: live ? progress : 1 }}
          />
        </div>
        <div className="grid gap-8 md:mt-8 md:grid-cols-3 md:gap-0">
          {content.steps.map((step, index) => (
            <Step key={step.title} index={index} progress={progress} live={live} />
          ))}
        </div>
      </div>
    </section>
  );
}
