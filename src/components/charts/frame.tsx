export function ChartFrame({
  title,
  description,
  children,
  rows,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  rows: ReadonlyArray<{ label: string; detail: string }>;
}) {
  return (
    <figure tabIndex={0} aria-label={title} className="min-w-0 border border-line bg-paper-raised p-4">
      <figcaption>
        <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-relaxed text-ink-soft">{description}</p> : null}
      </figcaption>
      <div className="mt-3">{children}</div>
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.label}-${row.detail}`}>
              <td>{row.label}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
