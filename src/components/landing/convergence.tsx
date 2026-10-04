"use client";

import { Check } from "lucide-react";
import {
  type MotionValue,
  easeIn,
  easeOut,
  m,
  useMotionTemplate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { content } from "@/components/landing/content";
import { journal, money, sources, totalAssets } from "@/components/landing/sample-data";
import { cn } from "@/lib/utils";

const { title, captions, chips, exports: targets } = content.convergence;

const DOCK = { x: 50, y: 38 };
const PILL_Y = 90;
const kindColor = {
  wallet: sources[0].color,
  exchange: sources[1].color,
  custodian: sources[2].color,
};

function useSceneSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ w: 1000, h: 600 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function Chip({
  chip,
  index,
  progress,
}: {
  chip: (typeof chips)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const start = 0.02 + index * 0.03;
  const end = start + 0.17;
  const xn = useTransform(progress, [start, end], [chip.x - DOCK.x, 0], {
    ease: easeOut,
  });
  const yn = useTransform(progress, [start, end], [chip.y - DOCK.y, 0], {
    ease: easeIn,
  });
  const x = useMotionTemplate`${xn}cqw`;
  const y = useMotionTemplate`${yn}cqh`;
  const scale = useTransform(progress, [start, end], [1, 0.55]);
  const opacity = useTransform(progress, [start, start + (end - start) * 0.75, end], [1, 1, 0]);

  return (
    <m.span
      className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-[11px] whitespace-nowrap shadow-sm will-change-transform sm:text-xs"
      style={{ left: `${DOCK.x}%`, top: `${DOCK.y}%`, x, y, scale, opacity }}
    >
      <span className={cn("size-2 rounded-full ring-1 ring-border", kindColor[chip.kind as keyof typeof kindColor])} />
      {chip.label}
    </m.span>
  );
}

function Total({ progress }: { progress: MotionValue<number> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const value = useTransform(progress, [0.3, 0.55], [0, totalAssets]);
  const write = (latest: number) => {
    if (ref.current) ref.current.textContent = money(Math.round(latest));
  };
  useMotionValueEvent(value, "change", write);
  useEffect(() => write(value.get()));
  return (
    <span ref={ref} className="tabular-nums">
      {money(totalAssets)}
    </span>
  );
}

function JournalRow({
  row,
  index,
  progress,
}: {
  row: (typeof journal)[number];
  index: number;
  progress: MotionValue<number>;
}) {
  const start = 0.55 + index * 0.06;
  const opacity = useTransform(progress, [start, start + 0.1], [0.2, 1]);
  const x = useTransform(progress, [start, start + 0.1], [-10, 0]);
  const debit = row.debit > 0;
  return (
    <m.div className="flex items-center justify-between gap-3 py-2 text-[11px] sm:text-xs" style={{ opacity, x }}>
      <span>
        <span className="mr-2 font-mono text-muted-foreground">{debit ? "Dr" : "Cr"}</span>
        {row.account}
      </span>
      <span className="font-mono tabular-nums">{money(debit ? row.debit : row.credit, 2)}</span>
    </m.div>
  );
}

function Connector({
  index,
  count,
  size,
  progress,
}: {
  index: number;
  count: number;
  size: { w: number; h: number };
  progress: MotionValue<number>;
}) {
  const pathLength = useTransform(progress, [0.75 + index * 0.04, 0.9 + index * 0.03], [0, 1]);
  const sx = size.w * 0.5;
  const sy = size.h * (DOCK.y / 100);
  const ex = size.w * ((20 + (index * 60) / (count - 1)) / 100);
  const ey = size.h * ((PILL_Y - 5) / 100);
  const mid = (ey - sy) * 0.55;
  const d = `M${sx} ${sy} C${sx} ${sy + mid} ${ex} ${ey - mid} ${ex} ${ey}`;
  return (
    <>
      <path d={d} fill="none" strokeWidth={1.5} className="stroke-border" />
      <m.path
        d={d}
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        className="stroke-brand dark:stroke-primary"
        style={{ pathLength }}
      />
    </>
  );
}

function ExportPill({ label, index, progress }: { label: string; index: number; progress: MotionValue<number> }) {
  const start = 0.82 + index * 0.04;
  const opacity = useTransform(progress, [start, start + 0.08], [0.25, 1]);
  const y = useTransform(progress, [start, start + 0.08], [8, 0]);
  const left = 20 + (index * 60) / (targets.length - 1);
  return (
    <m.span
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border bg-card px-4 py-2 text-xs font-medium shadow-sm"
      style={{ left: `${left}%`, top: `${PILL_Y}%`, opacity, y }}
    >
      {label}
    </m.span>
  );
}

function Caption({
  text,
  stops,
  opacities,
  progress,
}: {
  text: string;
  stops: number[];
  opacities: number[];
  progress: MotionValue<number>;
}) {
  const opacity = useTransform(progress, stops, opacities);
  const y = useTransform(
    progress,
    stops,
    opacities.map((value, index) => (value === 1 ? 0 : index < opacities.length / 2 ? 10 : -10)),
  );
  return (
    <m.p
      className="absolute inset-0 flex items-center justify-center px-4 text-center font-heading text-lg tracking-tight text-balance sm:text-2xl"
      style={{ opacity, y }}
    >
      {text}
    </m.p>
  );
}

export function Convergence() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const size = useSceneSize(sceneRef);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });
  const settled = useMotionValue(1);
  const progress = reduce ? settled : scrollYProgress;

  const cardOpacity = useTransform(progress, [0.2, 0.5], [0.3, 1]);
  const barScale = useTransform(progress, [0.3, 0.55], [0, 1]);
  const badgeScale = useTransform(progress, [0.72, 0.8], [0.6, 1]);
  const badgeOpacity = useTransform(progress, [0.72, 0.8], [0.2, 1]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="convergence-title"
      className={cn("page-width", reduce ? "py-16" : "h-[180vh] md:h-[240vh]")}
    >
      <h2 id="convergence-title" className="sr-only">
        {title}
      </h2>
      <ol className="sr-only">
        {captions.map((caption) => (
          <li key={caption}>{caption}</li>
        ))}
      </ol>
      <div
        aria-hidden
        className={cn("flex flex-col items-center justify-center gap-6", !reduce && "sticky top-0 h-svh pt-16")}
      >
        <div className="relative h-16 w-full max-w-2xl">
          <Caption text={captions[0]} stops={[0, 0.28, 0.36]} opacities={[1, 1, 0]} progress={progress} />
          <Caption text={captions[1]} stops={[0.36, 0.44, 0.62, 0.68]} opacities={[0, 1, 1, 0]} progress={progress} />
          <Caption text={captions[2]} stops={[0.68, 0.76, 1]} opacities={[0, 1, 1]} progress={progress} />
        </div>

        <div
          ref={sceneRef}
          className="relative w-full max-w-5xl [container-type:size]"
          style={{ height: "min(600px, 66svh)" }}
        >
          <svg className="absolute inset-0 size-full" viewBox={`0 0 ${size.w} ${size.h}`} fill="none">
            {targets.map((label, index) => (
              <Connector key={label} index={index} count={targets.length} size={size} progress={progress} />
            ))}
          </svg>

          <div
            className="absolute left-1/2 w-[min(92%,30rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background"
            style={{ top: `${DOCK.y}%` }}
          >
          <m.div className="rounded-xl border bg-card p-4 shadow-xl sm:p-5" style={{ opacity: cardOpacity }}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Total asset value</p>
              <m.span
                className="flex items-center gap-1 rounded-full bg-[#e0f5c7] px-2.5 py-1 text-[10px] font-semibold text-[#2e5013]"
                style={{ scale: badgeScale, opacity: badgeOpacity }}
              >
                <Check className="size-3" aria-hidden /> Balanced
              </m.span>
            </div>
            <p className="mt-1 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              USD <Total progress={progress} />
            </p>
            <m.div className="mt-3 flex h-2.5 origin-left overflow-hidden rounded-sm" style={{ scaleX: barScale }}>
              {sources.map((source) => (
                <span
                  key={source.name}
                  className={source.color}
                  style={{ width: `${(source.amount / totalAssets) * 100}%` }}
                />
              ))}
            </m.div>
            <div className="mt-3 divide-y border-t">
              {journal.map((row, index) => (
                <JournalRow key={row.account} row={row} index={index} progress={progress} />
              ))}
            </div>
          </m.div>
          </div>

          {targets.map((label, index) => (
            <ExportPill key={label} label={label} index={index} progress={progress} />
          ))}
          {chips.map((chip, index) => (
            <Chip key={chip.label} chip={chip} index={index} progress={progress} />
          ))}
        </div>
      </div>
    </section>
  );
}
