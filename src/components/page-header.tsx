import { InfoHint } from "@/components/app/info-hint";
import { isLongDescription } from "@/components/app/info-hint-text";

export function PageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  // A long intro moves into an info hint beside the title; a short one stays under it.
  const hinted = description ? isLongDescription(description) : false;
  return (
    <header className="mb-8 max-w-3xl">
      <p className="eyebrow">{kicker}</p>
      {hinted ? (
        <div className="mt-1 flex items-center gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <InfoHint title={title}>{description}</InfoHint>
        </div>
      ) : (
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      )}
      {description && !hinted ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
    </header>
  );
}