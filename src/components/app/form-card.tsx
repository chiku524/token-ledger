import { cn } from "@/lib/utils";

type FormCardProps = Omit<React.ComponentProps<"form">, "title"> & {
  title?: string;
  description?: string;
  headingLevel?: "h2" | "h3";
};

export function FormCard({ title, description, headingLevel = "h2", className, children, ...props }: FormCardProps) {
  const Heading = headingLevel;
  return (
    <form className={cn("grid gap-3 rounded-xl border border-border bg-card p-4", className)} {...props}>
      {title ? (
        <Heading className={cn("col-span-full font-semibold tracking-tight", headingLevel === "h2" ? "text-lg" : "text-base")}>
          {title}
        </Heading>
      ) : null}
      {description ? (
        <p className="col-span-full max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </form>
  );
}
