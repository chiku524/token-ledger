import { cn } from "@/lib/utils";

export type LogoVariant = "brand" | "onLight" | "onLime" | "mono";

const parts: Record<LogoVariant, { tile: string; top: string; rows: string }> = {
  brand: { tile: "fill-brand", top: "fill-primary", rows: "fill-cloud" },
  onLight: { tile: "fill-white stroke-border", top: "fill-primary", rows: "fill-brand" },
  onLime: { tile: "fill-primary", top: "fill-night", rows: "fill-night" },
  mono: { tile: "fill-none stroke-current", top: "fill-current", rows: "fill-current" },
};

export function LogoMark({ variant = "brand", className = "h-8 w-8" }: { variant?: LogoVariant; className?: string }) {
  const p = parts[variant];
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" className={p.tile} />
      <rect x="7" y="8" width="10" height="3.2" rx="1" className={p.top} />
      <rect x="7" y="14.4" width="18" height="3.2" rx="1" className={p.rows} />
      <rect x="7" y="20.8" width="14" height="3.2" rx="1" className={p.rows} />
    </svg>
  );
}

export function Logo({ variant = "brand", className }: { variant?: LogoVariant; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark variant={variant} />
      <span className="font-display text-base font-bold tracking-tight whitespace-nowrap">Token Ledger</span>
    </span>
  );
}
