import { createConnectionAction } from "@/app/dashboard/actions";
import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { WATCH_VENUES } from "@/data/connections";
import type { Books } from "@/data/books";

/**
 * The fields for adding a wallet to track: paste a public address, no connection
 * and no signature. Shared by the Connect modal and the Settings panel so the two
 * entry points cannot drift. Wrap it in your own `<form>` (or `FormCard`).
 */
export function WatchWalletFields({
  books,
  csrf,
  next,
  submitLabel = "Track address",
}: {
  books: Books;
  csrf: string;
  next: string;
  submitLabel?: string;
}) {
  return (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="mode" value="watch" />
      <input type="hidden" name="next" value={next} />
      <Field label="Company">
        <NativeSelect name="entityId" required defaultValue={books.entities[0]?.id}>
          {books.entities.map((entity) => (
            <NativeSelectOption key={entity.id} value={entity.id}>
              {entity.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Name">
        <Input name="name" required maxLength={200} />
      </Field>
      <Field label="Network">
        <NativeSelect name="chain" defaultValue="ethereum">
          {WATCH_VENUES.map((venue) => (
            <NativeSelectOption key={venue.key} value={venue.key}>
              {venue.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Wallet type">
        <NativeSelect name="role" defaultValue="hot">
          <NativeSelectOption value="hot">Hot wallet</NativeSelectOption>
          <NativeSelectOption value="cold">Cold wallet</NativeSelectOption>
          <NativeSelectOption value="staking">Staking</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field label="Address" className="sm:col-span-2">
        <Input name="identifier" required maxLength={200} className="font-mono" />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </>
  );
}

/** The form element around `WatchWalletFields`, for a plain page section. */
export function TrackWalletForm({
  books,
  csrf,
  next = "/dashboard/settings",
  submitLabel,
}: {
  books: Books;
  csrf: string;
  next?: string;
  submitLabel?: string;
}) {
  return (
    <form action={createConnectionAction} className="grid gap-3 sm:grid-cols-2">
      <WatchWalletFields books={books} csrf={csrf} next={next} submitLabel={submitLabel} />
    </form>
  );
}
