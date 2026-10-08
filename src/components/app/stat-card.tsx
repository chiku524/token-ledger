import { NumberTicker } from "@/components/motion/number-ticker";
import { StaggerItem } from "@/components/motion/stagger";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger";
  hint?: React.ReactNode;
}) {
  return (
    <StaggerItem className="@container min-w-0 rounded-xl border border-border bg-card px-2.5 py-2.5 sm:px-4 sm:py-3">
      <dl className="flex h-full flex-col justify-between gap-2">
        <dt className="text-[10px] leading-tight font-medium text-muted-foreground @[8rem]:text-xs">{label}</dt>
        <dd
          className={cn(
            "font-display leading-none font-bold tracking-tight",
            typeof value === "number"
              ? "text-2xl @[6rem]:text-3xl @[9rem]:text-4xl"
              : "text-sm leading-tight @[6rem]:text-lg @[9rem]:text-2xl @[12rem]:text-3xl @[16rem]:text-4xl",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
          )}
        >
          {typeof value === "number" ? <NumberTicker value={value} maximumFractionDigits={0} className="font-display" /> : value}
        </dd>
        {hint ? <dd className="min-w-0 text-xs text-muted-foreground">{hint}</dd> : null}
      </dl>
    </StaggerItem>
  );
}
