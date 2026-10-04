"use client";

import { Building2, Sprout, type LucideIcon } from "lucide-react";
import { m, useScroll, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { content } from "@/components/landing/content";
import { Reveal } from "@/components/motion/reveal";
import { useMinWidth, useScrollLive } from "@/components/motion/use-scroll-live";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const icons: LucideIcon[] = [Sprout, Building2];
const spring = { stiffness: 120, damping: 30, mass: 0.4 };

function PlanCard({ index }: { index: number }) {
  const plan = content.plans[index];
  const Icon = icons[index];
  return (
    <Card className="gap-0 py-0 shadow-none md:min-h-60">
      <CardContent className="flex flex-1 flex-col justify-between gap-8 p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <Icon className="size-9" strokeWidth={1.4} aria-hidden />
          <Badge variant="example">Planned</Badge>
        </div>
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">{plan.name}</h3>
          <p className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">{plan.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function Plans() {
  const live = useScrollLive();
  const wide = useMinWidth(768);
  const stack = live && wide;
  const spacerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: spacerRef, offset: ["end end", "end 140px"] });
  const progress = useSpring(scrollYProgress, spring);
  const scale = useTransform(progress, [0, 1], [1, 0.95]);
  const dim = useTransform(progress, [0, 1], [0, 0.45]);
  const settle = useTransform(progress, [0.6, 1], [24, 0]);

  return (
    <section id="plans" className="page-width scroll-mt-24">
      <div className="grid gap-9 border-t py-14 sm:py-16 md:grid-cols-[.85fr_1.25fr] md:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <Reveal>
            <h2 className="section-title max-w-[360px]">{content.plansTitle}</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">{content.plansDescription}</p>
          </Reveal>
        </div>
        <div className="space-y-3 md:space-y-0 md:pb-[10vh]">
          <div className="md:sticky md:top-28 md:mb-6">
            <m.div className="relative origin-top" style={stack ? { scale } : undefined}>
              <PlanCard index={0} />
              {stack && (
                <m.div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-xl bg-background"
                  style={{ opacity: dim }}
                />
              )}
            </m.div>
          </div>
          <div ref={spacerRef} aria-hidden className="hidden h-[40vh] md:block" />
          <div className="md:sticky md:top-[8.5rem]">
            <m.div style={stack ? { y: settle } : undefined}>
              <PlanCard index={1} />
            </m.div>
          </div>
        </div>
      </div>
    </section>
  );
}
