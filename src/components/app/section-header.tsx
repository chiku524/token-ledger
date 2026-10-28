import { InfoHint } from "@/components/app/info-hint";
import { isLongDescription } from "@/components/app/info-hint-text";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  // A long description lives in an info hint next to the title; a short one stays under it.
  const hinted = description ? isLongDescription(description) : false;
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        {hinted ? (
          <div className="flex items-center gap-1">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <InfoHint title={title}>{description}</InfoHint>
          </div>
        ) : (
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        )}
        {description && !hinted ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
