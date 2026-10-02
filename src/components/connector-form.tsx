import { SubmitButton } from "@/components/submit-button";
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
    <form id={id} action={createConnectionAction} className="grid scroll-mt-6 gap-3 panel p-4 md:grid-cols-2">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next} />
      {mode === "exchange_read" ? <input type="hidden" name="role" value="" /> : null}
      {mode === "exchange_read" ? <input type="hidden" name="chain" value="" /> : null}
      {mode === "custodian_read" ? <input type="hidden" name="role" value="" /> : null}
      <h2 className="text-lg font-semibold tracking-tight md:col-span-2">{title}</h2>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-soft md:col-span-2">{intro}</p>
      <label className="field">
        <span>Company</span>
        <select name="entityId" required defaultValue={books.entities[0]?.id}>
          {books.entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Name</span>
        <input name="name" required maxLength={200} />
      </label>
      {mode === "watch" ? (
        <>
          <label className="field">
            <span>Network</span>
            <select name="chain" defaultValue="ethereum">
              {WATCH_VENUES.map((venue) => (
                <option key={venue.key} value={venue.key}>
                  {venue.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Wallet type</span>
            <select name="role" defaultValue="hot">
              <option value="hot">Hot wallet</option>
              <option value="cold">Cold wallet</option>
              <option value="staking">Staking</option>
            </select>
          </label>
        </>
      ) : null}
      {mode === "exchange_read" ? (
        <label className="field md:col-span-2">
          <span>Exchange</span>
          <select name="exchangeVenue" defaultValue="kraken">
            {listVenues().map((venue) => (
              <option key={venue.key} value={venue.key}>
                {venue.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {mode === "custodian_read" ? (
        <label className="field md:col-span-2">
          <span>Custodian</span>
          <select name="custodianVenue" defaultValue="fireblocks">
            {Object.values(CUSTODIANS).map((custodian) => (
              <option key={custodian.key} value={custodian.key}>
                {custodian.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field md:col-span-2">
        <span>{mode === "watch" ? "Address" : mode === "exchange_read" ? "Account label" : "Vault account id"}</span>
        <input name="identifier" required maxLength={200} className="font-mono text-sm" />
      </label>
      {mode === "custodian_read" ? (
        <>
          <p className="text-sm leading-relaxed text-ink-soft md:col-span-2">
            Enter a read-only credential. <strong>BitGo:</strong> a view-only access token in the API key field (leave
            the secret blank). <strong>Fireblocks:</strong> a Viewer API user id as the key and its RSA private key
            (PEM) as the secret. Both are checked, then sealed, and cannot sign or move funds.
          </p>
          <label className="field">
            <span>API user id</span>
            <input name="apiKey" autoComplete="off" maxLength={200} className="font-mono text-sm" />
          </label>
          <label className="field">
            <span>RSA private key (PEM)</span>
            <textarea name="apiSecret" rows={4} autoComplete="off" maxLength={4000} className="font-mono text-sm" />
          </label>
        </>
      ) : null}
      {mode === "exchange_read" ? (
        <>
          <p className="text-sm leading-relaxed text-ink-soft md:col-span-2">
            Create a <strong>read-only</strong> API key with the exchange that can read balances, ledger entries, and
            trade history only. Leave trading and withdrawal <strong>off</strong>. The key is checked, then sealed; it
            cannot trade or withdraw. Read-only scopes per exchange:{" "}
            {listVenues()
              .map((venue) => `${venue.label} — ${venue.scopes.join(", ")}`)
              .join(" · ")}
            .
          </p>
          <label className="field">
            <span>API key</span>
            <input name="apiKey" autoComplete="off" maxLength={200} className="font-mono text-sm" />
          </label>
          <label className="field">
            <span>API secret</span>
            <input name="apiSecret" type="password" autoComplete="off" maxLength={400} className="font-mono text-sm" />
          </label>
        </>
      ) : null}
      <div className="md:col-span-2">
        <SubmitButton>
          Add connection
        </SubmitButton>
      </div>
    </form>
  );
}
