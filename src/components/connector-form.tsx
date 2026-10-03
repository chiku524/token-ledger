import { Field } from "@/components/app/field";
import { FormCard } from "@/components/app/form-card";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption as Option } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createConnectionAction } from "@/app/dashboard/actions";
import type { Books, ConnectionMode } from "@/data/books";
import { listVenues } from "@/adapters";
import { CUSTODIANS } from "@/adapters/sources/custodian/registry";
import { WATCH_VENUES } from "@/data/connections";

export function ConnectorForm({
  books,
  csrf,
  mode,
  next,
  id,
  title,
  intro,
}: {
  books: Books;
  csrf: string;
  mode: ConnectionMode;
  next: string;
  id: string;
  title: string;
  intro: string;
}) {
  return (
    <FormCard id={id} action={createConnectionAction} title={title} description={intro} className="scroll-mt-6 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      {mode === "exchange_read" ? <input type="hidden" name="role" value="" /> : null}
      {mode === "exchange_read" ? <input type="hidden" name="chain" value="" /> : null}
      {mode === "custodian_read" ? <input type="hidden" name="role" value="" /> : null}
      <Field label="Company">
        <NativeSelect name="entityId" required defaultValue={books.entities[0]?.id}>
          {books.entities.map((entity) => (
            <Option key={entity.id} value={entity.id}>
              {entity.name}
            </Option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Name">
        <Input name="name" required maxLength={200} />
      </Field>
      {mode === "watch" ? (
        <>
          <Field label="Network">
            <NativeSelect name="chain" defaultValue="ethereum">
              {WATCH_VENUES.map((venue) => (
                <Option key={venue.key} value={venue.key}>
                  {venue.label}
                </Option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Wallet type">
            <NativeSelect name="role" defaultValue="hot">
              <Option value="hot">Hot wallet</Option>
              <Option value="cold">Cold wallet</Option>
              <Option value="staking">Staking</Option>
            </NativeSelect>
          </Field>
        </>
      ) : null}
      {mode === "exchange_read" ? (
        <Field label="Exchange" className="md:col-span-2">
          <NativeSelect name="exchangeVenue" defaultValue="kraken">
            {listVenues().map((venue) => (
              <Option key={venue.key} value={venue.key}>
                {venue.label}
              </Option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      {mode === "custodian_read" ? (
        <Field label="Custodian" className="md:col-span-2">
          <NativeSelect name="custodianVenue" defaultValue="fireblocks">
            {Object.values(CUSTODIANS).map((custodian) => (
              <Option key={custodian.key} value={custodian.key}>
                {custodian.label}
              </Option>
            ))}
          </NativeSelect>
        </Field>
      ) : null}
      <Field
        label={mode === "watch" ? "Address" : mode === "exchange_read" ? "Account label" : "Vault account id"}
        className="md:col-span-2"
      >
        <Input name="identifier" required maxLength={200} className="font-mono" />
      </Field>
      {mode === "custodian_read" ? (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground md:col-span-2">
            Enter a read-only credential. <strong>BitGo:</strong> a view-only access token in the API key field (leave
            the secret blank). <strong>Fireblocks:</strong> a Viewer API user id as the key and its RSA private key
            (PEM) as the secret. Both are checked, then sealed, and cannot sign or move funds.
          </p>
          <Field label="API user id">
            <Input name="apiKey" autoComplete="off" maxLength={200} className="font-mono" />
          </Field>
          <Field label="RSA private key (PEM)">
            <Textarea name="apiSecret" rows={4} autoComplete="off" maxLength={4000} className="font-mono" />
          </Field>
        </>
      ) : null}
      {mode === "exchange_read" ? (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground md:col-span-2">
            Create a <strong>read-only</strong> API key with the exchange that can read balances, ledger entries, and
            trade history only. Leave trading and withdrawal <strong>off</strong>. The key is checked, then sealed; it
            cannot trade or withdraw. Read-only scopes per exchange:{" "}
            {listVenues()
              .map((venue) => `${venue.label} — ${venue.scopes.join(", ")}`)
              .join(" · ")}
            .
          </p>
          <Field label="API key">
            <Input name="apiKey" autoComplete="off" maxLength={200} className="font-mono" />
          </Field>
          <Field label="API secret">
            <Input name="apiSecret" type="password" autoComplete="off" maxLength={400} className="font-mono" />
          </Field>
        </>
      ) : null}
      <div className="md:col-span-2">
        <SubmitButton>Add connection</SubmitButton>
      </div>
    </FormCard>
  );
}
