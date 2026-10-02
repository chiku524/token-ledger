export function PageHeader({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-8 max-w-3xl">
      <p className="kicker">{kicker}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
    </header>
  );
}
