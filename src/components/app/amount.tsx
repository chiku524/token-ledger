import { cn } from "@/lib/utils";

/** Money, hashes and addresses: monospaced with tabular figures. Pass `tone` to colour by sign. */
export function Amount({
  children,
  tone,
  className,
}: {
  children: React.ReactNode;
  tone?: "success" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-mono whitespace-nowrap tabular-nums",
        tone === "success" && "text-success",
        tone === "danger" && "text-danger",
        className,
      )}
    >
      {children}
    </span>
  );
}
