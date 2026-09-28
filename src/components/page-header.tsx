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
      <p className="text-[0.7rem] font-medium tracking-[0.18em] text-ink-soft uppercase">{kicker}</p>
      <h1 className="mt-2 font-serif text-3xl tracking-tight md:text-4xl">{title}</h1>
      {description ? <p className="mt-3 text-base leading-relaxed text-ink-soft">{description}</p> : null}
    </header>
  );
}
