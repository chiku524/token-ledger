import { InfoHint } from "@/components/app/info-hint";
import { isLongDescription } from "@/components/app/info-hint-text";
import { cn } from "@/lib/utils";

type FormCardProps = Omit<React.ComponentProps<"form">, "title"> & {
  title?: string;
  description?: string;
  headingLevel?: "h2" | "h3";
};

export function FormCard({ title, description, headingLevel = "h2", className, children, ...props }: FormCardProps) {
  const Heading = headingLevel;
  // With a title, a long description moves into an info hint beside it.
  const hinted = Boolean(title && description && isLongDescription(description));
  return (
    <form className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 rounded-xl border border-border bg-card p-4", className)} {...props}>
      {title && hinted ? (
        <div className="col-span-full flex items-center gap-1">
          <Heading className={cn("font-semibold tracking-tight", headingLevel === "h2" ? "text-lg" : "text-base")}>{title}</Heading>
          <InfoHint title={title}>{description}</InfoHint>
        </div>
      ) : title ? (
        <Heading className={cn("col-span-full font-semibold tracking-tight", headingLevel === "h2" ? "text-lg" : "text-base")}>
          {title}
        </Heading>
      ) : null}
      {description && !hinted ? (
        <p className="col-span-full max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </form>
  );
}
