import { NumberTicker } from "@/components/motion/number-ticker";
import { StaggerItem } from "@/components/motion/stagger";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "success" | "danger";
}) {
  return (
    <StaggerItem className="rounded-xl border border-border bg-card px-4 py-3">
      <dl>
        <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
        <dd
          className={cn(
            "mt-1 font-display text-2xl font-bold tracking-tight",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
          )}
        >
          {typeof value === "number" ? <NumberTicker value={value} maximumFractionDigits={0} className="font-display" /> : value}
        </dd>
      </dl>
    </StaggerItem>
  );
}
