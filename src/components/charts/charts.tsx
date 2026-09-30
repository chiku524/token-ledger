"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LinePanel, MoneyRow, SourceStatusRow, StatusRow } from "@/data/charts";

const INK = "var(--chart-ink)";
const INK_SOFT = "var(--chart-muted)";
const LINE = "var(--chart-line)";
const PINE = "var(--chart-pine)";
const SEAL = "var(--chart-seal)";
const DOT = "var(--chart-dot)";
const CURSOR = "var(--chart-cursor)";
const BAR_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const tick = { fill: INK_SOFT, fontSize: 11 };

export function MoneyBars({ rows, currency }: { rows: MoneyRow[]; currency: string }) {
  const height = Math.max(168, rows.length * 42 + 28);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label={`${currency} bar chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={LINE} />
          <XAxis type="number" tick={tick} axisLine={{ stroke: LINE }} tickLine={false} tickFormatter={axisAmount} />
          <YAxis
            type="category"
            dataKey="label"
            width={138}
            tick={tick}
            axisLine={false}
            tickLine={false}
            tickFormatter={shortLabel}
          />
          <Tooltip content={<MoneyTip />} cursor={{ fill: CURSOR }} />
          <Bar dataKey="value" barSize={16} isAnimationActive={false}>
            {rows.map((row, index) => (
              <Cell key={row.id} fill={BAR_COLORS[index % BAR_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MoneyLine({ panel }: { panel: LinePanel }) {
  return (
    <div className="h-52 w-full" role="img" aria-label={panel.title}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={panel.points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={LINE} vertical={false} />
          <XAxis dataKey="axisLabel" tick={tick} axisLine={{ stroke: LINE }} tickLine={false} minTickGap={28} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={44} tickFormatter={axisAmount} />
          <Tooltip content={<MoneyTip />} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={PINE}
            strokeWidth={2}
            dot={{ r: 3, fill: PINE, stroke: DOT }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusDonut({ rows, total }: { rows: StatusRow[]; total: number }) {
  return (
    <div>
      <div className="relative h-48 w-full" role="img" aria-label="Matching status">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="82%"
              stroke="var(--chart-dot)"
              paddingAngle={2}
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell key={row.id} fill={row.fill} />
              ))}
            </Pie>
            <Tooltip content={<CountTip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-semibold tracking-tight leading-none">{total}</p>
          <p className="mt-1 text-[0.68rem] tracking-[0.14em] text-ink-soft uppercase">Rows</p>
        </div>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: row.fill }} aria-hidden />
            <span>
              {row.label} <span className="num text-ink-soft">{row.formatted}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatusBars({ rows }: { rows: SourceStatusRow[] }) {
  const height = Math.max(180, rows.length * 36 + 36);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Matching by wallet, exchange, or custodian">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={rows} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
          <CartesianGrid horizontal={false} stroke={LINE} />
          <XAxis type="number" allowDecimals={false} tick={tick} axisLine={{ stroke: LINE }} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={148}
            tick={tick}
            axisLine={false}
            tickLine={false}
            tickFormatter={shortLabel}
          />
          <Tooltip content={<StatusTip />} cursor={{ fill: CURSOR }} />
          <Bar dataKey="matched" name="Matched" stackId="status" fill={PINE} barSize={14} isAnimationActive={false} />
          <Bar dataKey="exception" name="Unmatched" stackId="status" fill={SEAL} barSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
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
  return (
    <div>
      <div className="h-56 w-full" role="img" aria-label="Entries by month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={LINE} vertical={false} />
            <XAxis dataKey="label" tick={tick} axisLine={{ stroke: LINE }} tickLine={false} />
            <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} width={28} />
            <Tooltip content={<ActivityTip series={series} />} cursor={{ fill: CURSOR }} />
            {series.map((item) => (
              <Bar key={item.id} dataKey={item.id} name={item.label} fill={item.color} barSize={18} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {series.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5" style={{ background: item.color }} aria-hidden />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MoneyTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: MoneyRow | LinePanel["points"][number] }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="panel px-3 py-2 text-sm text-ink">
      <p>{row.label}</p>
      <p className="num mt-1 text-left">{row.formatted}</p>
    </div>
  );
}

function CountTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: StatusRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="panel px-3 py-2 text-sm">
      <p>{row.label}</p>
      <p className="num mt-1 text-left">{row.formatted}</p>
    </div>
  );
}

function StatusTip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; payload?: SourceStatusRow; color?: string }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="panel px-3 py-2 text-sm">
      <p>{row.label}</p>
      <p className="mt-1 text-pine">Matched {row.matched}</p>
      <p className="text-seal">Unmatched {row.exception}</p>
    </div>
  );
}

function ActivityTip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ name?: string; value?: number; payload?: { fullLabel?: string } }>;
  series: Array<{ id: string; label: string; color: string }>;
}) {
  if (!active || !payload?.length) return null;
  const title = payload[0]?.payload?.fullLabel;
  return (
    <div className="panel px-3 py-2 text-sm">
      {title ? <p>{title}</p> : null}
      {payload.map((item) => (
        <p key={String(item.name)} className="mt-1" style={{ color: INK }}>
          <span className="text-ink-soft">{series.find((entry) => entry.label === item.name)?.label ?? item.name}</span>{" "}
          <span className="num">{item.value}</span>
        </p>
      ))}
    </div>
  );
}

function axisAmount(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function shortLabel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}…` : value;
}
