import { formatMinor } from "@/ledger";
import { watchVenueLabel } from "./connections";
import { assetByCode, exampleAccounts, exampleAssets, exampleEntities, exampleSources } from "./example-books";

const FIAT_DECIMALS: Record<string, number> = { MYR: 2, SGD: 2, USD: 2 };

export function formatMoney(amountMinor: bigint, currency: string): string {
  const scale = FIAT_DECIMALS[currency];
  if (scale === undefined) {
    throw new Error(`No display scale configured for ${currency}.`);
  }
  return `${currency} ${formatMinor(amountMinor, scale, { minFraction: scale, maxFraction: scale })}`;
}

export function formatQuantity(
  quantityMinor: bigint,
  assetCode: string,
  assets: readonly { code: string; decimals: number }[] = exampleAssets,
): string {
  const asset = assets.find((item) => item.code === assetCode) ?? assetByCode(assetCode);
  const scale = asset?.decimals ?? 0;
  const maxFraction = Math.min(8, scale);
  return `${formatMinor(quantityMinor, scale, { minFraction: 0, maxFraction })} ${assetCode}`;
}

export function entityName(id: string, entities: readonly { id: string; name: string }[] = exampleEntities): string {
  return entities.find((entity) => entity.id === id)?.name ?? id;
}

export function sourceName(id: string, sources: readonly { id: string; name: string }[] = exampleSources): string {
  return sources.find((source) => source.id === id)?.name ?? id;
}

export function movementLabel(direction: "in" | "out"): string {
  return direction === "out" ? "Sent" : "Received";
}

export function placeTypeLabel(kind: "wallet" | "exchange" | "custodian"): string {
  if (kind === "wallet") return "Wallet";
  if (kind === "exchange") return "Exchange";
  return "Custodian";
}

export function walletRoleLabel(role: "hot" | "cold" | "staking" | null): string {
  if (role === "hot") return "Hot wallet";
  if (role === "cold") return "Cold wallet";
  if (role === "staking") return "Staking";
  return "—";
}

export function connectionModeLabel(mode: "watch" | "exchange_read" | "custodian_read"): string {
  if (mode === "watch") return "Watch-only wallet";
  if (mode === "exchange_read") return "Exchange, read-only";
  return "Custodian, read-only";
}

export function connectionStatusLabel(status: "pending" | "healthy" | "degraded" | "revoked"): string {
  if (status === "healthy") return "Up to date";
  if (status === "pending") return "Waiting";
  if (status === "degraded") return "Needs attention";
  return "Disconnected";
}

/** A value's freshness, for a badge next to a price or rate. */
export function freshnessLabel(age: "fresh" | "stale" | "missing"): string {
  if (age === "fresh") return "Fresh";
  if (age === "stale") return "Stale";
  return "No price";
}

export function originLabel(origin: "example" | "live"): string {
  return origin === "live" ? "Live" : "Example";
}

/** Whole-day age of a timestamp relative to a reference, for "2 days old". */
export function ageLabel(asOf: string, reference: string): string {
  const observed = Date.parse(asOf);
  const at = Date.parse(reference);
  if (Number.isNaN(observed) || Number.isNaN(at)) return "unknown age";
  const days = Math.max(0, Math.floor((at - observed) / (24 * 60 * 60 * 1000)));
  if (days === 0) return "today";
  return days === 1 ? "1 day old" : `${days} days old`;
}

export function syncRunStatusLabel(status: "running" | "ok" | "partial" | "failed" | "not_live"): string {
  if (status === "ok") return "Read";
  if (status === "running") return "Running";
  if (status === "partial") return "Partial";
  if (status === "not_live") return "Not live";
  return "Failed";
}

export function syncRunTriggerLabel(trigger: "manual" | "scheduled" | "webhook" | "cli"): string {
  if (trigger === "scheduled") return "Scheduled";
  if (trigger === "webhook") return "Webhook";
  if (trigger === "cli") return "Command line";
  return "Manual";
}

export function venueLabel(venue: string): string {
  if (venue === "exchange") return "Exchange";
  if (venue === "custodian") return "Custodian";
  return watchVenueLabel(venue);
}

export function scopeLabel(scopes: string): string {
  const labels: Record<string, string> = { balances: "Balances", movements: "Movements" };
  return scopes
    .split(",")
    .map((scope) => labels[scope.trim()] ?? scope.trim())
    .filter(Boolean)
    .join(" and ");
}

/** Plain label for a stored valuation tag such as IAS 38. The stored value is unchanged. */
export function valuationLabel(basis: string | null): string {
  if (!basis) return "—";
  const labels: Record<string, string> = {
    "IAS 38": "Crypto",
    "IAS 2": "Crypto for sale",
    "IFRS 9": "Stablecoin",
    "IFRS 13": "Market value",
  };
  return labels[basis] ?? basis;
}

const ACTION_LABELS: Record<string, string> = {
  "journal.posted": "Entry posted",
  "journal.reversed": "Entry corrected",
  "entity.created": "Company added",
  "source.created": "Place added",
  "connection.created": "Connection added",
  "connection.revoked": "Connection disconnected",
  "connection.sync_failed": "Connection check failed",
  "connection.synced": "Connection read",
  "connection.tour_completed": "Connection tour finished",
  "connection.tour_reopened": "Connection tour opened again",
  "source_transactions.imported": "Activity imported",
  "source_transactions.received": "Event received",
  "fx.recorded": "Rate saved",
  "auth.signed_in": "Signed in",
  "auth.sign_in_failed": "Sign-in failed",
  "auth.signed_out": "Signed out",
  "user.invited": "Person invited",
  "user.role_changed": "Access changed",
  "user.deactivated": "Person turned off",
  "user.invite_accepted": "Invite accepted",
  "user.bootstrapped": "Owner created",
  "user.signed_up": "Account created",
  "user.seeded": "Sample person added",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const SUBJECT_LABELS: Record<string, string> = {
  entity: "Company",
  source: "Place",
  connection: "Connection",
  journal_entry: "Entry",
  user: "Person",
  fx_rate: "Rate",
};

export function subjectLabel(subjectType: string): string {
  return SUBJECT_LABELS[subjectType] ?? subjectType;
}

export function accountLabel(
  entityId: string,
  code: string,
  accounts: readonly { entityId: string; code: string; name: string }[] = exampleAccounts,
): string {
  const account = accounts.find((item) => item.entityId === entityId && item.code === code);
  return account ? `${account.code} ${account.name}` : code;
}
