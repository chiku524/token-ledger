import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
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
      <Field label="From">
        <Input type="date" name="from" defaultValue={range.from} required />
      </Field>
      <Field label="To">
        <Input type="date" name="to" defaultValue={range.to} required />
      </Field>
      <SubmitButton>Update dates</SubmitButton>
    </form>
  );
}
