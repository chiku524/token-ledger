/**
 * Custodian provider registry. Mirrors the exchange venue registry: each
 * provider supplies a read-only connector and the connection UI reads from here.
 * Only Fireblocks is implemented; the others are declared for the roadmap.
 */
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { FireblocksCustodianAdapterOptions } from "../custodian";
import { FireblocksCustodianAdapter } from "../custodian";

export interface CustodianDefinition {
  key: string;
  label: string;
  keyUrl: string;
  scopes: string[];
  implemented: boolean;
  /** Build a reader for credential verification, or null when not implemented. */
  verify(credential: ExchangeCredentialInput, options?: FireblocksCustodianAdapterOptions): Promise<void>;
}

export const CUSTODIANS: Record<string, CustodianDefinition> = {
  fireblocks: {
    key: "fireblocks",
    label: "Fireblocks",
    keyUrl: "https://console.fireblocks.io/v2/developer/api-users",
    scopes: ["Viewer role (read-only)"],
    implemented: true,
    async verify(credential) {
      await new FireblocksCustodianAdapter({ credential }).fetchBalances({ since: "1970-01-01", externalAccountId: "0" });
    },
  },
};

export const CUSTODIAN_KEYS = Object.keys(CUSTODIANS);

export function custodianDefinition(key: string): CustodianDefinition | null {
  return CUSTODIANS[key] ?? null;
}
