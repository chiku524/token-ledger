import { Badge } from "@/components/ui/badge";

export type StatusTone = "success" | "danger" | "warning" | "neutral" | "live" | "example";

/** One badge for every status in the app, so colours and meaning stay consistent. */
export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant={tone} className={className}>
      {children}
    </Badge>
  );
}

/** Connection health: healthy is good, degraded needs attention, anything else is quiet. */
export function connectionStatusTone(status: string): StatusTone {
  if (status === "healthy") return "success";
  if (status === "degraded") return "danger";
  return "neutral";
}
