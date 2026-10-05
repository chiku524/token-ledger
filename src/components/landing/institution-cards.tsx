"use client";

import { Banknote, Building, CircleDollarSign, Coins, Landmark, Scale, type LucideIcon } from "lucide-react";
import { m, useInView } from "motion/react";
import { useRef } from "react";
import { content } from "@/components/landing/content";
import { useMinWidth, useScrollLive } from "@/components/motion/use-scroll-live";
import { Card, CardContent } from "@/components/ui/card";

const icons: LucideIcon[] = [Landmark, Scale, CircleDollarSign, Coins, Building, Banknote];
const ease = [0.22, 1, 0.36, 1] as const;

function InstitutionCard({ index, columns, live }: { index: number; columns: number; live: boolean }) {
  const item = content.institutions[index];
  const Icon = icons[index];
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35, margin: "0px 0px -6% 0px" });
  const row = Math.floor(index / columns);

  return (
    <m.div
      ref={ref}
      initial={false}
      animate={live ? { opacity: inView ? 1 : 0, y: inView ? 0 : 16 } : undefined}
      transition={{ duration: 0.6, ease, delay: inView ? row * 0.14 : 0 }}
    >
      <Card className="h-full gap-0 py-0 shadow-none">
        <CardContent className="p-6">
          <div className="mb-6 flex size-11 items-center justify-center rounded-xl border bg-muted text-brand dark:text-primary">
            <Icon strokeWidth={1.6} className="size-5" aria-hidden />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">{item.name}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
        </CardContent>
      </Card>
    </m.div>
  );
}

export function InstitutionCards() {
  const live = useScrollLive();
  const threeUp = useMinWidth(1024);
  const twoUp = useMinWidth(640);
  const columns = threeUp ? 3 : twoUp ? 2 : 1;

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {content.institutions.map((item, index) => (
        <InstitutionCard key={item.name} index={index} columns={columns} live={live} />
      ))}
    </div>
  );
}
