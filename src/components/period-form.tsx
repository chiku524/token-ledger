import type { DateRange } from "@/data/period";

export function PeriodForm({
  path,
  range,
  hidden,
}: {
  path: string;
  range: DateRange;
  hidden?: Record<string, string>;
}) {
  return (
    <form method="get" action={path} className="mb-8 flex flex-wrap items-end gap-3">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)
        : null}
      <label className="field">
        <span>From</span>
        <input type="date" name="from" defaultValue={range.from} required />
      </label>
      <label className="field">
        <span>To</span>
        <input type="date" name="to" defaultValue={range.to} required />
      </label>
      <button type="submit" className="btn">
        Apply period
      </button>
    </form>
  );
}
