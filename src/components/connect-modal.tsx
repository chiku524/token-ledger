"use client";

import { useEffect, useId, useState } from "react";
import { createConnectionAction } from "@/app/dashboard/actions";
import { startExchangeOauthAction } from "@/app/dashboard/exchange-oauth-actions";
import { SubmitButton } from "@/components/submit-button";
import { WalletVerifyForm } from "@/components/wallet-verify-form";
import { WATCH_VENUES } from "@/data/connections";
import type { Books } from "@/data/books";

export interface ConnectExchange {
  key: string;
  label: string;
  scopes: string[];
  oauth: boolean;
  oauthReady: boolean;
  defaultTab: "oauth" | "api";
}

export interface ConnectCustodian {
  key: string;
  label: string;
}

type Panel =
  | { kind: "list" }
  | { kind: "wallet"; method: "sign" | "watch" }
  | { kind: "exchange"; exchange: ConnectExchange; method: "oauth" | "api" }
  | { kind: "custodian"; custodian: ConnectCustodian };

export function ConnectModal({
  csrf,
  next,
  books,
  exchanges,
  custodians,
  projectId,
  defaultOpen = false,
}: {
  csrf: string;
  next: string;
  books: Books;
  exchanges: ConnectExchange[];
  custodians: ConnectCustodian[];
  projectId: string | null;
  defaultOpen?: boolean;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>({ kind: "list" });

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const visibleExchanges = exchanges.filter((item) => item.label.toLowerCase().includes(needle));
  const visibleCustodians = custodians.filter((item) => item.label.toLowerCase().includes(needle));
  const showWallet = "wallet".includes(needle) || needle === "";

  return (
    <>
      <button type="button" className="btn" onClick={() => { setPanel({ kind: "list" }); setQuery(""); setOpen(true); }}>
        Connect
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-10" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="panel w-full max-w-2xl p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="kicker">Connect</p>
                <h2 id={titleId} className="mt-1 text-lg font-semibold tracking-tight">
                  {panel.kind === "list" ? "Add a wallet, exchange, or custodian" : heading(panel)}
                </h2>
              </div>
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Read-only. A connection cannot trade, withdraw, or sign a transfer.
            </p>

            {panel.kind === "list" ? (
              <div className="mt-4 grid gap-4">
                <label className="field">
                  <span>Search</span>
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Coinbase, Bybit, wallet" />
                </label>
                {showWallet ? (
                  <Choice
                    title="Wallet"
                    detail="Connect and sign, or paste an address to watch."
                    onClick={() => setPanel({ kind: "wallet", method: "sign" })}
                  />
                ) : null}
                {visibleExchanges.map((exchange) => (
                  <Choice
                    key={exchange.key}
                    title={exchange.label}
                    detail={exchange.oauth ? "OAuth or a read-only API key." : "Read-only API key."}
                    onClick={() => setPanel({ kind: "exchange", exchange, method: exchange.oauth ? exchange.defaultTab : "api" })}
                  />
                ))}
                {visibleCustodians.map((custodian) => (
                  <Choice
                    key={custodian.key}
                    title={custodian.label}
                    detail="Viewer credential. It cannot sign."
                    onClick={() => setPanel({ kind: "custodian", custodian })}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
                <button type="button" className="btn-secondary w-fit" onClick={() => setPanel({ kind: "list" })}>
                  Back
                </button>
                {panel.kind === "wallet" ? (
                  <WalletPanel method={panel.method} setMethod={(method) => setPanel({ kind: "wallet", method })} books={books} csrf={csrf} next={next} projectId={projectId} />
                ) : null}
                {panel.kind === "exchange" ? (
                  <ExchangePanel
                    exchange={panel.exchange}
                    method={panel.method}
                    setMethod={(method) => setPanel({ kind: "exchange", exchange: panel.exchange, method })}
                    entities={books.entities}
                    csrf={csrf}
                    next={next}
                  />
                ) : null}
                {panel.kind === "custodian" ? (
                  <CustodianPanel custodian={panel.custodian} entities={books.entities} csrf={csrf} next={next} />
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function heading(panel: Exclude<Panel, { kind: "list" }>): string {
  if (panel.kind === "wallet") return "Wallet";
  if (panel.kind === "exchange") return panel.exchange.label;
  return panel.custodian.label;
}

function Choice({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button type="button" className="rounded-lg border border-line bg-paper-raised px-4 py-3 text-left hover:border-cobalt" onClick={onClick}>
      <span className="block font-medium">{title}</span>
      <span className="mt-1 block text-sm text-ink-soft">{detail}</span>
    </button>
  );
}

function CompanyField({ entities }: { entities: Books["entities"] }) {
  return (
    <label className="field">
      <span>Company</span>
      <select name="entityId" required defaultValue={entities[0]?.id}>
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function WalletPanel({
  method,
  setMethod,
  books,
  csrf,
  next,
  projectId,
}: {
  method: "sign" | "watch";
  setMethod: (method: "sign" | "watch") => void;
  books: Books;
  csrf: string;
  next: string;
  projectId: string | null;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={method === "sign" ? "btn" : "btn-secondary"} onClick={() => setMethod("sign")}>
          Connect and sign
        </button>
        <button type="button" className={method === "watch" ? "btn" : "btn-secondary"} onClick={() => setMethod("watch")}>
          Watch an address
        </button>
      </div>
      {method === "sign" ? (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">
            Sign a one-time message with an installed wallet, or WalletConnect. The signature does not allow a transfer, and no key is stored.
          </p>
          <WalletVerifyForm books={books} csrf={csrf} next={next} projectId={projectId} />
        </>
      ) : (
        <form action={createConnectionAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="mode" value="watch" />
          <input type="hidden" name="next" value={next} />
          <p className="text-sm leading-relaxed text-ink-soft md:col-span-2">
            Paste a public address. No signature is required. Use this for a cold address or any wallet you cannot sign with.
          </p>
          <CompanyField entities={books.entities} />
          <label className="field">
            <span>Name</span>
            <input name="name" required maxLength={200} />
          </label>
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
          <label className="field md:col-span-2">
            <span>Address</span>
            <input name="identifier" required maxLength={200} className="font-mono text-sm" />
          </label>
          <div className="md:col-span-2">
            <SubmitButton>Watch address</SubmitButton>
          </div>
        </form>
      )}
    </>
  );
}

function ExchangePanel({
  exchange,
  method,
  setMethod,
  entities,
  csrf,
  next,
}: {
  exchange: ConnectExchange;
  method: "oauth" | "api";
  setMethod: (method: "oauth" | "api") => void;
  entities: Books["entities"];
  csrf: string;
  next: string;
}) {
  return (
    <>
      {exchange.oauth ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={method === "oauth" ? "btn" : "btn-secondary"} onClick={() => setMethod("oauth")}>
            OAuth
          </button>
          <button type="button" className={method === "api" ? "btn" : "btn-secondary"} onClick={() => setMethod("api")}>
            API key
          </button>
        </div>
      ) : null}
      {exchange.oauth && method === "oauth" ? (
        <form action={startExchangeOauthAction} className="grid gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="venue" value={exchange.key} />
          <p className="text-sm leading-relaxed text-ink-soft">
            You will be sent to {exchange.label} to allow read-only access. Token Ledger cannot trade or withdraw, and you can revoke access at the exchange.
          </p>
          <CompanyField entities={entities} />
          {exchange.oauthReady ? (
            <SubmitButton>Connect</SubmitButton>
          ) : (
            <p className="text-sm text-ink-soft">
              OAuth is off until the {exchange.label} client id is set on the server. Use an API key instead.
            </p>
          )}
        </form>
      ) : (
        <form action={createConnectionAction} className="grid gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="mode" value="exchange_read" />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="exchangeVenue" value={exchange.key} />
          <input type="hidden" name="name" value={exchange.label} />
          <input type="hidden" name="identifier" value="main" />
          <input type="hidden" name="role" value="" />
          <input type="hidden" name="chain" value="" />
          <p className="text-sm leading-relaxed text-ink-soft">
            Create a read-only key with {exchange.scopes.join(", ")}. Leave trading and withdrawal off. The key is checked, then sealed.
          </p>
          <CompanyField entities={entities} />
          <label className="field">
            <span>API key</span>
            <input name="apiKey" required autoComplete="off" maxLength={200} className="font-mono text-sm" />
          </label>
          <label className="field">
            <span>API secret</span>
            <input name="apiSecret" required type="password" autoComplete="off" maxLength={400} className="font-mono text-sm" />
          </label>
          {exchange.key === "okx" || exchange.key === "kucoin" ? (
            <label className="field">
              <span>API passphrase</span>
              <input name="apiPassphrase" required type="password" autoComplete="off" maxLength={200} className="font-mono text-sm" />
            </label>
          ) : null}
          <SubmitButton>Connect</SubmitButton>
        </form>
      )}
    </>
  );
}

function CustodianPanel({
  custodian,
  entities,
  csrf,
  next,
}: {
  custodian: ConnectCustodian;
  entities: Books["entities"];
  csrf: string;
  next: string;
}) {
  const bitgo = custodian.key === "bitgo";
  return (
    <form action={createConnectionAction} className="grid gap-3">
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="mode" value="custodian_read" />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="custodianVenue" value={custodian.key} />
      <input type="hidden" name="name" value={custodian.label} />
      <input type="hidden" name="role" value="" />
      <p className="text-sm leading-relaxed text-ink-soft">
        {bitgo
          ? "Paste a BitGo view-only access token. It cannot sign or send."
          : "A Fireblocks Viewer API user id, and its RSA private key. It cannot sign or move funds."}
      </p>
      <CompanyField entities={entities} />
      <label className="field">
        <span>{bitgo ? "Wallet id" : "Vault account id"}</span>
        <input name="identifier" required maxLength={200} className="font-mono text-sm" />
      </label>
      <label className="field">
        <span>{bitgo ? "Access token" : "API user id"}</span>
        <input name="apiKey" required autoComplete="off" maxLength={200} className="font-mono text-sm" />
      </label>
      {bitgo ? <input type="hidden" name="apiSecret" value="token" /> : (
        <label className="field">
          <span>RSA private key (PEM)</span>
          <textarea name="apiSecret" required rows={4} autoComplete="off" maxLength={4000} className="font-mono text-sm" />
        </label>
      )}
      <SubmitButton>Connect</SubmitButton>
    </form>
  );
}
