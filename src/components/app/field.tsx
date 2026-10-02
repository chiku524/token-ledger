import { cn } from "@/lib/utils";

/**
 * A labelled form control. The control sits inside the `<label>`, so it works with
 * `Input`, `Textarea`, a native `<select>` or any other control, in server components.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 text-sm", className)}>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-muted-foreground">{label}</span>
        {children}
      </label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
