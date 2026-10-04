import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
  variant = "rise",
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "rise" | "stagger" | "scale";
}) {
  const base = {
    rise: "reveal",
    stagger: "reveal-stagger",
    scale: "reveal-scale",
  }[variant];
  return <div className={cn(base, className)}>{children}</div>;
}
