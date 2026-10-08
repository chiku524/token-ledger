"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Client-only chart entry points. The charts draw nothing until they scroll
 * into view (`useChartReveal`), so server-rendering them only pays the cost of
 * parsing `recharts` — several hundred KB — on every Worker isolate. Loading
 * them with `ssr: false` keeps `recharts` out of the server bundle while the
 * accessible fallback table in `ChartFrame` still describes the data. Until the
 * chunk arrives, each chart shows a skeleton at its own height.
 */
function skeleton(className: string) {
  return function ChartSkeleton() {
    return <Skeleton className={className} />;
  };
}
const moneyBarsLoading = skeleton("h-42 w-full");
const moneyLineLoading = skeleton("h-52 w-full");
const statusDonutLoading = skeleton("h-48 w-full");
const statusBarsLoading = skeleton("h-45 w-full");
const activityBarsLoading = skeleton("h-56 w-full");

export const MoneyBars = dynamic(() => import("./charts").then((mod) => mod.MoneyBars), { ssr: false, loading: moneyBarsLoading });
export const MoneyLine = dynamic(() => import("./charts").then((mod) => mod.MoneyLine), { ssr: false, loading: moneyLineLoading });
export const StatusDonut = dynamic(() => import("./charts").then((mod) => mod.StatusDonut), { ssr: false, loading: statusDonutLoading });
export const StatusBars = dynamic(() => import("./charts").then((mod) => mod.StatusBars), { ssr: false, loading: statusBarsLoading });
export const ActivityBars = dynamic(() => import("./charts").then((mod) => mod.ActivityBars), { ssr: false, loading: activityBarsLoading });
