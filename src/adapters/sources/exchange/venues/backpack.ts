/**
 * Backpack venue, read-only.
 *
 * Backpack signs with an ED25519 keypair. The user supplies the base64 verifying
 * key (the "API key") and the base64 private seed (the "secret"). Signed reads
 * prefix the signing string with an instruction type. Never calls an order,
 * cancel, or withdraw instruction.
 */
import { createPrivateKey, sign as edSign } from "node:crypto";
import type { ExchangeCredentialInput } from "@/adapters/credentials/store";
import type { NormalizedBalance, NormalizedSourceTransaction } from "../../../types";
import { decimalsFor, toMinorUnits } from "../amounts";
import { requestJson } from "../http";
import type { VenueConnector, VenueDefinition } from "../venue";

const BASE = "https://api.backpack.exchange";
const WINDOW = "5000";

/** PKCS#8 wrapper for a raw 32-byte ED25519 seed. */
function privateKeyFromSeed(seedBase64: string) {
  const seed = Buffer.from(seedBase64, "base64");
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  return createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
}

class BackpackConnector implements VenueConnector {
  private readonly privateKey: ReturnType<typeof createPrivateKey>;

  constructor(
    private readonly credential: ExchangeCredentialInput,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {
    this.privateKey = privateKeyFromSeed(credential.apiSecret);
  }

  private headers(instruction: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const signingString = `instruction=${instruction}&timestamp=${timestamp}&window=${WINDOW}`;
    const signature = edSign(null, Buffer.from(signingString), this.privateKey).toString("base64");
    return {
      "X-API-Key": this.credential.apiKey,
      "X-Timestamp": timestamp,
      "X-Window": WINDOW,
      "X-Signature": signature,
    };
  }

  private async signedGet<T>(path: string, instruction: string): Promise<T> {
    return requestJson<T>(this.fetchImpl, `${this.baseUrl}${path}`, { headers: this.headers(instruction) });
  }

  async fetchBalances(now = new Date()): Promise<NormalizedBalance[]> {
    const asOf = now.toISOString();
    const balances = await this.signedGet<Record<string, { available: string; locked: string; staked?: string }>>(
      "/api/v1/capital",
      "balanceQuery",
    );
    return Object.entries(balances)
      .map(([asset, entry]) => {
        const decimals = decimalsFor(asset);
        const total =
          toMinorUnits(entry.available || "0", decimals) +
          toMinorUnits(entry.locked || "0", decimals) +
          toMinorUnits(entry.staked || "0", decimals);
        return { assetCode: asset.toUpperCase(), quantityMinor: total, asOf };
      })
      .filter((row) => row.quantityMinor !== 0n);
  }

  async fetchTransactions(since: string, until?: string): Promise<NormalizedSourceTransaction[]> {
    const from = Date.parse(`${since}T00:00:00.000Z`);
    const to = until ? Date.parse(`${until}T23:59:59.999Z`) : Date.now();
    const movements: NormalizedSourceTransaction[] = [];

    const deposits = await this.signedGet<Array<{ id: string; symbol: string; quantity: string; createdAt: string }>>(
      "/api/v1/deposits",
      "depositQueryAll",
    );
    for (const row of deposits) {
      const ms = Date.parse(row.createdAt);
      if (Number.isNaN(ms) || ms < from || ms > to) continue;
      movements.push(movement(row.id, ms, row.symbol, row.quantity, "in", "Backpack deposit."));
    }

    const withdrawals = await this.signedGet<Array<{ id: string; symbol: string; quantity: string; createdAt: string }>>(
      "/api/v1/withdrawals",
      "withdrawalQueryAll",
    );
    for (const row of withdrawals) {
      const ms = Date.parse(row.createdAt);
      if (Number.isNaN(ms) || ms < from || ms > to) continue;
      movements.push(movement(row.id, ms, row.symbol, row.quantity, "out", "Backpack withdrawal."));
    }

    return movements
      .filter((item) => item.occurredOn >= since && (!until || item.occurredOn <= until))
      .sort((a, b) => (a.occurredOn < b.occurredOn ? 1 : -1));
  }

  async verify(): Promise<void> {
    await this.fetchBalances();
  }
}

function movement(id: string, ms: number, asset: string, amount: string, direction: "in" | "out", description: string): NormalizedSourceTransaction {
  return {
    externalId: `backpack-${id}`,
    occurredOn: new Date(ms).toISOString().slice(0, 10),
    assetCode: asset.toUpperCase(),
    direction,
    quantityMinor: toMinorUnits(amount, decimalsFor(asset)),
    description,
    chain: "backpack",
  };
}

export const backpackVenue: VenueDefinition = {
  key: "backpack",
  label: "Backpack",
  summary: "Read-only balances, deposits, and withdrawals from a Backpack account (ED25519).",
  keyUrl: "https://backpack.exchange/settings/api-keys",
  scopes: ["Read-only API key"],
  create(credential, options = {}) {
    return new BackpackConnector(credential, options.baseUrl ?? BASE, options.fetchImpl ?? fetch);
  },
};
