"use client";

import dynamic from "next/dynamic";

/**
 * Client-only chart entry points. The charts render nothing until they scroll
 * into view (`useChartReveal`), so server-rendering them only pays the cost of
 * parsing `recharts` — several hundred KB — on every Worker isolate. Loading
 * them with `ssr: false` keeps `recharts` out of the server bundle while the
 * accessible fallback table in `ChartFrame` still describes the data.
 */
const loading = () => null;

export const MoneyBars = dynamic(() => import("./charts").then((mod) => mod.MoneyBars), { ssr: false, loading });
export const MoneyLine = dynamic(() => import("./charts").then((mod) => mod.MoneyLine), { ssr: false, loading });
export const StatusDonut = dynamic(() => import("./charts").then((mod) => mod.StatusDonut), { ssr: false, loading });
export const StatusBars = dynamic(() => import("./charts").then((mod) => mod.StatusBars), { ssr: false, loading });
export const ActivityBars = dynamic(() => import("./charts").then((mod) => mod.ActivityBars), { ssr: false, loading });
