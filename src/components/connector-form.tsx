import { createConnectionAction } from "@/app/dashboard/actions";
import type { Books, ConnectionMode } from "@/data/books";

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
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
              <option value="polygon">Polygon</option>
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
      {mode === "custodian_read" ? (
        <label className="field">
          <span>Network</span>
          <select name="chain" defaultValue="">
            <option value="">None</option>
            <option value="ethereum">Ethereum</option>
            <option value="solana">Solana</option>
            <option value="polygon">Polygon</option>
          </select>
        </label>
      ) : null}
      <label className="field md:col-span-2">
        <span>{mode === "watch" ? "Address" : mode === "exchange_read" ? "Account ID" : "Vault ID"}</span>
        <input name="identifier" required maxLength={200} className="font-mono text-sm" />
      </label>
      <div className="md:col-span-2">
        <button type="submit" className="btn">
          Add connection
        </button>
      </div>
    </form>
  );
}
