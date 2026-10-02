import { cn } from "@/lib/utils";

/** Staggers its `StaggerItem` children in on mount. Use for short groups (about 8 items or fewer). */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("stagger", className)}>{children}</div>;
}

export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
