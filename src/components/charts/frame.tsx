import { SectionHeader } from "@/components/app/section-header";
import { Card } from "@/components/ui/card";

export function ChartFrame({
  title,
  description,
  children,
  rows,
  empty,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  rows: ReadonlyArray<{ label: string; detail: string }>;
  empty?: string;
}) {
  return (
    <figure tabIndex={0} aria-label={title} className="min-w-0">
      <Card className="gap-3 px-4">
        <figcaption>
          <SectionHeader title={title} description={description} />
        </figcaption>
        {rows.length === 0 ? (
          <p className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
            {empty ?? "Nothing to chart for these dates."}
          </p>
        ) : (
          children
        )}
        {rows.length > 0 ? (
          <div className="sr-only">
            <table>
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
          </div>
        ) : null}
      </Card>
    </figure>
  );
}
