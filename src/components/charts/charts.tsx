"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  Rectangle,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
  type PieSectorDataItem,
} from "recharts";
import type { LinePanel, MoneyRow, SourceStatusRow, StatusRow } from "@/data/charts";
import { cn } from "@/lib/utils";
import { useChartReveal } from "./use-chart-reveal";

const INK_SOFT = "var(--chart-muted)";
const LINE = "var(--chart-line)";
const PINE = "var(--chart-pine)";
const SEAL = "var(--chart-seal)";
const SURFACE = "var(--chart-dot)";
const CURSOR = "var(--chart-cursor)";
const ACCENT = "var(--chart-1)";
const BAR_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tick = { fill: INK_SOFT, fontSize: 11 };
const DIM = 0.35;
const DURATION = 650;
const EASING = "ease-out" as const;
const fade = { transition: "fill-opacity 150ms ease, opacity 150ms ease" };

type TipRow = { key: string; label: string; value: string; color?: string };

export function MoneyBars({ rows, currency }: { rows: MoneyRow[]; currency: string }) {
  const { ref, show, animate } = useChartReveal();
  const [active, setActive] = useState<number | null>(null);
  const height = Math.max(168, rows.length * 42 + 28);
  return (
    <div ref={ref} className="w-full" style={{ height }} role="img" aria-label={`${currency} bar chart`}>
      {show ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
            onMouseLeave={() => setActive(null)}
          >
            <CartesianGrid horizontal={false} stroke={LINE} />
            <XAxis type="number" tick={tick} axisLine={false} tickLine={false} tickFormatter={axisAmount} />
            <YAxis
              type="category"
              dataKey="label"
              width={labelWidth(rows)}
              tick={tick}
              axisLine={false}
              tickLine={false}
              tickFormatter={shortLabel}
            />
            <Tooltip
              cursor={{ fill: CURSOR, radius: 6 }}
              animationDuration={180}
              content={({ active: on, payload }) => {
                const row = payload?.[0]?.payload as MoneyRow | undefined;
                if (!on || !row) return null;
                const index = rows.indexOf(row);
                return <ChartTooltip rows={[{ key: row.id, label: row.label, value: row.formatted, color: barColor(index) }]} />;
              }}
            />
            <Bar
              dataKey="value"
              barSize={16}
              radius={[0, 4, 4, 0]}
              isAnimationActive={animate}
              animationDuration={DURATION}
              animationEasing={EASING}
              onMouseEnter={(_, index) => setActive(index)}
            >
              {rows.map((row, index) => (
                <Cell key={row.id} fill={barColor(index)} fillOpacity={dimmed(active, index)} style={fade} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export function MoneyLine({ panel }: { panel: LinePanel }) {
  const { ref, show, animate } = useChartReveal();
  const last = panel.points.length - 1;
  return (
    <div ref={ref} className="h-52 w-full" role="img" aria-label={panel.title}>
      {show ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={panel.points} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis dataKey="axisLabel" tick={tick} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={28} />
            <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={axisAmount} />
            <Tooltip
              cursor={{ stroke: INK_SOFT, strokeWidth: 1, strokeOpacity: 0.5 }}
              animationDuration={180}
              content={({ active, payload }) => {
                const point = payload?.[0]?.payload as LinePanel["points"][number] | undefined;
                if (!active || !point) return null;
                return <ChartTooltip rows={[{ key: point.id, label: point.label, value: point.formatted, color: ACCENT }]} />;
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={ACCENT}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={ACCENT}
              fillOpacity={0.1}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === last && props.cx !== undefined && props.cy !== undefined ? (
                  <circle key="end" cx={props.cx} cy={props.cy} r={4} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
                ) : (
                  <g key={`dot-${props.index}`} />
                )
              }
              activeDot={{ r: 5, fill: ACCENT, stroke: SURFACE, strokeWidth: 2 }}
              isAnimationActive={animate}
              animationDuration={900}
              animationEasing={EASING}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export function StatusDonut({ rows, total }: { rows: StatusRow[]; total: number }) {
  const { ref, show, animate } = useChartReveal();
  const [active, setActive] = useState<number | null>(null);
  const focus = active === null ? undefined : rows[active];
  return (
    <div>
      <div ref={ref} className="relative h-48 w-full" role="img" aria-label="Matching status">
        {show ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="label"
                innerRadius="64%"
                outerRadius="84%"
                cornerRadius={4}
                paddingAngle={rows.filter((row) => row.value > 0).length > 1 ? 3 : 0}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                activeShape={(props: PieSectorDataItem) => (
                  <Sector {...props} outerRadius={(props.outerRadius ?? 0) + 4} />
                )}
                onMouseEnter={(_, index) => setActive(index)}
                onMouseLeave={() => setActive(null)}
                isAnimationActive={animate}
                animationDuration={800}
                animationEasing={EASING}
              >
                {rows.map((row, index) => (
                  <Cell key={row.id} fill={row.fill} fillOpacity={dimmed(active, index)} style={fade} />
                ))}
              </Pie>
              <Tooltip content={() => null} cursor={false} />
            </PieChart>
          </ResponsiveContainer>
        ) : null}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p key={focus?.id ?? "total"} className="animate-in fade-in-0 zoom-in-95 text-2xl leading-none font-semibold tracking-tight duration-200">
            {focus ? focus.formatted : total}
          </p>
          <p className="mt-1 text-[0.68rem] tracking-[0.14em] text-muted-foreground uppercase">{focus ? focus.label : "Rows"}</p>
        </div>
      </div>
      <Legend
        items={rows.map((row) => ({ key: row.id, label: row.label, detail: row.formatted, color: row.fill, shape: "dot" }))}
        active={active}
        onActive={setActive}
      />
    </div>
  );
}

export function StatusBars({ rows }: { rows: SourceStatusRow[] }) {
  const { ref, show, animate } = useChartReveal();
  const [active, setActive] = useState<number | null>(null);
  const height = Math.max(180, rows.length * 36 + 36);
  return (
    <div ref={ref} className="w-full" style={{ height }} role="img" aria-label="Matching by wallet, exchange, or custodian">
      {show ? (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
            onMouseLeave={() => setActive(null)}
          >
            <CartesianGrid horizontal={false} stroke={LINE} />
            <XAxis type="number" allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="label"
              width={labelWidth(rows)}
              tick={tick}
              axisLine={false}
              tickLine={false}
              tickFormatter={shortLabel}
            />
            <Tooltip
              cursor={{ fill: CURSOR, radius: 6 }}
              animationDuration={180}
              content={({ active: on, payload }) => {
                const row = payload?.[0]?.payload as SourceStatusRow | undefined;
                if (!on || !row) return null;
                return (
                  <ChartTooltip
                    title={row.label}
                    rows={[
                      { key: "matched", label: "Matched", value: String(row.matched), color: PINE },
                      { key: "exception", label: "Unmatched", value: String(row.exception), color: SEAL },
                    ]}
                  />
                );
              }}
            />
            {(["matched", "exception"] as const).map((key, series) => (
              <Bar
                key={key}
                dataKey={key}
                name={key === "matched" ? "Matched" : "Unmatched"}
                stackId="status"
                fill={key === "matched" ? PINE : SEAL}
                stroke={SURFACE}
                strokeWidth={2}
                barSize={14}
                shape={(props: BarShapeProps) => {
                  const row = props.payload as SourceStatusRow;
                  const outer = key === "exception" || row.exception === 0;
                  return <Rectangle {...props} radius={outer ? [0, 4, 4, 0] : 0} />;
                }}
                isAnimationActive={animate}
                animationBegin={series * 120}
                animationDuration={DURATION}
                animationEasing={EASING}
                onMouseEnter={(_, index) => setActive(index)}
              >
                {rows.map((row, index) => (
                  <Cell key={row.id} fillOpacity={dimmed(active, index)} style={fade} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : null}
    </div>
  );
}

export function ActivityBars({
  rows,
  series,
}: {
  rows: Array<{ label: string; fullLabel: string } & Record<string, number | string>>;
  series: Array<{ id: string; label: string; color: string }>;
}) {
  const { ref, show, animate } = useChartReveal();
  const [activeSeries, setActiveSeries] = useState<number | null>(null);
  return (
    <div>
      <div ref={ref} className="h-56 w-full" role="img" aria-label="Entries by month">
        {show ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid stroke={LINE} vertical={false} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: LINE }} tickLine={false} />
              <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={28} />
              <Tooltip
                cursor={{ fill: CURSOR, radius: 6 }}
                animationDuration={180}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const title = (payload[0]?.payload as { fullLabel?: string } | undefined)?.fullLabel;
                  return (
                    <ChartTooltip
                      title={title}
                      rows={series.map((item) => ({
                        key: item.id,
                        label: item.label,
                        value: String(payload.find((entry) => entry.dataKey === item.id)?.value ?? 0),
                        color: item.color,
                      }))}
                    />
                  );
                }}
              />
              {series.map((item, index) => (
                <Bar
                  key={item.id}
                  dataKey={item.id}
                  name={item.label}
                  fill={item.color}
                  fillOpacity={dimmed(activeSeries, index)}
                  style={fade}
                  barSize={18}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={animate}
                  animationBegin={index * 120}
                  animationDuration={DURATION}
                  animationEasing={EASING}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <Legend
        items={series.map((item) => ({ key: item.id, label: item.label, color: item.color, shape: "bar" }))}
        active={activeSeries}
        onActive={setActiveSeries}
      />
    </div>
  );
}

function ChartTooltip({ title, rows }: { title?: string; rows: TipRow[] }) {
  return (
    <div className="animate-in fade-in-0 zoom-in-95 min-w-36 rounded-xl border border-border/70 bg-popover/85 px-3 py-2.5 text-popover-foreground shadow-lg shadow-black/10 backdrop-blur-md duration-150">
      {title ? <p className="mb-1.5 text-xs text-muted-foreground">{title}</p> : null}
      <ul className="grid gap-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-2">
            {row.color ? (
              <span aria-hidden className="mt-2 h-0.5 w-3 shrink-0 rounded-full" style={{ background: row.color }} />
            ) : null}
            <span className="grid">
              <span className="font-mono text-sm font-semibold tabular-nums">{row.value}</span>
              <span className="text-xs text-muted-foreground">{row.label}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({
  items,
  active,
  onActive,
}: {
  items: Array<{ key: string; label: string; detail?: string; color: string; shape: "dot" | "bar" }>;
  active: number | null;
  onActive: (index: number | null) => void;
}) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-1 gap-y-1 text-sm">
      {items.map((item, index) => (
        <li key={item.key}>
          <button
            type="button"
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1 transition-[opacity,background-color] duration-150 hover:bg-muted",
              active !== null && active !== index && "opacity-50",
            )}
            onMouseEnter={() => onActive(index)}
            onMouseLeave={() => onActive(null)}
            onFocus={() => onActive(index)}
            onBlur={() => onActive(null)}
          >
            <span
              aria-hidden
              className={cn("inline-block", item.shape === "dot" ? "size-2 rounded-full" : "size-2.5 rounded-[3px]")}
              style={{ background: item.color }}
            />
            <span>
              {item.label}
              {item.detail ? <span className="ml-1 font-mono text-muted-foreground tabular-nums">{item.detail}</span> : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function barColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length] ?? ACCENT;
}

function dimmed(active: number | null, index: number): number {
  return active === null || active === index ? 1 : DIM;
}

function axisAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function labelWidth(rows: readonly { label: string }[]): number {
  const longest = Math.max(0, ...rows.map((row) => shortLabel(row.label).length));
  return Math.min(148, Math.max(32, Math.ceil(longest * 6.4) + 12));
}

function shortLabel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}…` : value;
}
