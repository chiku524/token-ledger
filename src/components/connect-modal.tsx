"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { createConnectionAction } from "@/app/dashboard/actions";
import { startExchangeOauthAction } from "@/app/dashboard/exchange-oauth-actions";
import { Field } from "@/components/app/field";
import { SubmitButton } from "@/components/submit-button";
import { VenueMark } from "@/components/venue-mark";
import { WalletVerifyForm } from "@/components/wallet-verify-form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
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

  const needle = query.trim().toLowerCase();
  const visibleExchanges = exchanges.filter((item) => item.label.toLowerCase().includes(needle));
  const visibleCustodians = custodians.filter((item) => item.label.toLowerCase().includes(needle));
  const showWallet = "wallet".includes(needle) || needle === "";
  const nothing = !showWallet && visibleExchanges.length === 0 && visibleCustodians.length === 0;
  const markId = panel.kind === "wallet" ? "wallet" : panel.kind === "exchange" ? panel.exchange.key : panel.kind === "custodian" ? panel.custodian.key : null;

  function showList() {
    setPanel({ kind: "list" });
    setQuery("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) showList();
      }}
    >
      <DialogTrigger asChild>
        <Button>Connect</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(40rem,calc(100vh-2rem))] overflow-y-auto sm:max-w-lg" aria-labelledby={titleId}>
        <DialogHeader>
          {panel.kind === "list" ? null : (
            <Button type="button" variant="ghost" size="sm" className="w-fit px-2" onClick={showList}>
              <ChevronLeft />
              All connections
            </Button>
          )}
          <div className="flex items-center gap-3">
            {markId ? <VenueMark id={markId} /> : null}
            <div>
              <DialogTitle id={titleId}>{panel.kind === "list" ? "Add a connection" : heading(panel)}</DialogTitle>
              <DialogDescription className="mt-1">
                Read-only. A connection cannot trade, withdraw, or sign a transfer.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {panel.kind === "list" ? (
          <div className="grid gap-5">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Coinbase, Bybit, wallet"
                aria-label="Search connections"
                className="pl-8"
              />
            </div>
            {showWallet ? (
              <Section title="Wallets">
                <Choice
                  mark="wallet"
                  title="Wallet"
                  detail="Track a public address, or connect and sign."
                  onClick={() => setPanel({ kind: "wallet", method: "watch" })}
                />
              </Section>
            ) : null}
            {visibleExchanges.length > 0 ? (
              <Section title="Exchanges">
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleExchanges.map((exchange) => (
                    <Choice
                      key={exchange.key}
                      mark={exchange.key}
                      title={exchange.label}
                      detail={exchange.oauth ? "OAuth or a read-only API key" : "Read-only API key"}
                      onClick={() => setPanel({ kind: "exchange", exchange, method: exchange.oauth ? exchange.defaultTab : "api" })}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
            {visibleCustodians.length > 0 ? (
              <Section title="Custodians">
                <div className="grid gap-2 sm:grid-cols-2">
                  {visibleCustodians.map((custodian) => (
                    <Choice
                      key={custodian.key}
                      mark={custodian.key}
                      title={custodian.label}
                      detail="Viewer credential"
                      onClick={() => setPanel({ kind: "custodian", custodian })}
                    />
                  ))}
                </div>
              </Section>
            ) : null}
            {nothing ? <p className="text-sm text-muted-foreground">Nothing matches that search.</p> : null}
          </div>
        ) : panel.kind === "wallet" ? (
          <WalletPanel method={panel.method} setMethod={(method) => setPanel({ kind: "wallet", method })} books={books} csrf={csrf} next={next} projectId={projectId} />
        ) : panel.kind === "exchange" ? (
          <ExchangePanel
            exchange={panel.exchange}
            method={panel.method}
            setMethod={(method) => setPanel({ kind: "exchange", exchange: panel.exchange, method })}
            entities={books.entities}
            csrf={csrf}
            next={next}
          />
        ) : (
          <CustodianPanel custodian={panel.custodian} entities={books.entities} csrf={csrf} next={next} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function heading(panel: Exclude<Panel, { kind: "list" }>): string {
  if (panel.kind === "wallet") return "Wallet";
  if (panel.kind === "exchange") return panel.exchange.label;
  return panel.custodian.label;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Choice({ mark, title, detail, onClick }: { mark: string; title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2.5 text-left transition-colors hover:bg-muted"
      onClick={onClick}
    >
      <VenueMark id={mark} />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}

function CompanyField({ entities }: { entities: Books["entities"] }) {
  return (
    <Field label="Company">
      <NativeSelect name="entityId" required defaultValue={entities[0]?.id}>
        {entities.map((entity) => (
          <NativeSelectOption key={entity.id} value={entity.id}>
            {entity.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function MethodTabs({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button key={option.id} type="button" size="sm" variant={value === option.id ? "default" : "outline"} onClick={() => onChange(option.id)}>
          {option.label}
        </Button>
      ))}
    </div>
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
    <div className="grid gap-4">
      <MethodTabs
        value={method}
        onChange={(value) => setMethod(value === "sign" ? "sign" : "watch")}
        options={[
          { id: "watch", label: "Track an address (no signing)" },
          { id: "sign", label: "Connect and sign" },
        ]}
      />
      {method === "sign" ? (
        <>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Sign a one-time message with an installed wallet, or WalletConnect. The signature does not allow a transfer, and no key is stored.
          </p>
          <WalletVerifyForm books={books} csrf={csrf} next={next} projectId={projectId} />
        </>
      ) : (
        <form action={createConnectionAction} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="mode" value="watch" />
          <input type="hidden" name="next" value={next} />
          <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">
            Paste any public address to track it. No wallet connection and no signature are required — use this for a cold address,
            a customer wallet, or any address you cannot sign with. Tracking is read-only and stores no key.
          </p>
          <CompanyField entities={books.entities} />
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
            <SubmitButton>Track address</SubmitButton>
          </div>
        </form>
      )}
    </div>
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
    <div className="grid gap-4">
      {exchange.oauth ? (
        <MethodTabs
          value={method}
          onChange={(value) => setMethod(value === "api" ? "api" : "oauth")}
          options={[
            { id: "oauth", label: "OAuth" },
            { id: "api", label: "API key" },
          ]}
        />
      ) : null}
      {exchange.oauth && method === "oauth" ? (
        <form action={startExchangeOauthAction} className="grid gap-3">
          <input type="hidden" name="csrf" value={csrf} />
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="venue" value={exchange.key} />
          <p className="text-sm leading-relaxed text-muted-foreground">
            You will be sent to {exchange.label} to allow read-only access. Token Ledger cannot trade or withdraw, and you can revoke access at the exchange.
          </p>
          <CompanyField entities={entities} />
          {exchange.oauthReady ? (
            <SubmitButton>Connect</SubmitButton>
          ) : (
            <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
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
          <p className="text-sm leading-relaxed text-muted-foreground">
            {exchange.key === "coinbase"
              ? "From the CDP portal Secret API Keys tab: paste the key name (organizations/…/apiKeys/…) and the secret (Ed25519 base64 or ECDSA PEM). You can also paste the downloaded JSON key file into either field. Leave IP allowlist empty or include Vercel egress. The key is checked, then sealed."
              : `Create a read-only key with ${exchange.scopes.join(", ")}. Leave trading and withdrawal off. The key is checked, then sealed.`}
          </p>
          <CompanyField entities={entities} />
          <Field label={exchange.key === "coinbase" ? "API key name" : "API key"}>
            <Input
              name="apiKey"
              required
              autoComplete="off"
              maxLength={exchange.key === "coinbase" ? 4000 : 200}
              className="font-mono"
              placeholder={exchange.key === "coinbase" ? "organizations/.../apiKeys/..." : undefined}
            />
          </Field>
          {exchange.key === "coinbase" ? (
            <Field label="API secret (or JSON key file)">
              <Textarea name="apiSecret" required rows={4} autoComplete="off" maxLength={4000} className="font-mono" />
            </Field>
          ) : (
            <Field label="API secret">
              <Input name="apiSecret" required type="password" autoComplete="off" maxLength={400} className="font-mono" />
            </Field>
          )}
          {exchange.key === "okx" || exchange.key === "kucoin" ? (
            <Field label="API passphrase">
              <Input name="apiPassphrase" required type="password" autoComplete="off" maxLength={200} className="font-mono" />
            </Field>
          ) : null}
          <SubmitButton>Connect</SubmitButton>
        </form>
      )}
    </div>
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
      <p className="text-sm leading-relaxed text-muted-foreground">
        {bitgo
          ? "Paste a BitGo view-only access token. It cannot sign or send."
          : "A Fireblocks Viewer API user id, and its RSA private key. It cannot sign or move funds."}
      </p>
      <CompanyField entities={entities} />
      <Field label={bitgo ? "Wallet id" : "Vault account id"}>
        <Input name="identifier" required maxLength={200} className="font-mono" />
      </Field>
      <Field label={bitgo ? "Access token" : "API user id"}>
        <Input name="apiKey" required autoComplete="off" maxLength={200} className="font-mono" />
      </Field>
      {bitgo ? <input type="hidden" name="apiSecret" value="token" /> : (
        <Field label="RSA private key (PEM)">
          <Textarea name="apiSecret" required rows={4} autoComplete="off" maxLength={4000} className="font-mono" />
        </Field>
      )}
      <SubmitButton>Connect</SubmitButton>
    </form>
  );
}
