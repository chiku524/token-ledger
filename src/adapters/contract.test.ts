/**
 * Every source adapter runs the same contract (see contract-suite.ts). A new
 * adapter cannot be added without a case here, so the contract is enforced in
 * one place. The fixtures are recorded and the clients are faked, so this runs
 * in CI with no network.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runAdapterContract } from "./contract-suite";
import { validateBalances, validateTransactions } from "./contract";
import {
  BitcoinChainAdapter,
  EthereumChainAdapter,
  PolygonChainAdapter,
  SolanaChainAdapter,
  SuiChainAdapter,
} from "./sources/chain";
import { ExchangeSourceAdapter } from "./sources/exchange";
import { CustodianSourceAdapter } from "./sources/custodian";
import { EvmReader } from "./sources/evm/reader";
import { evmChain } from "./sources/evm/chains";
import { BitcoinReader } from "./sources/bitcoin/reader";
import type { EsploraClient } from "./sources/bitcoin/esplora";
import { SuiReader } from "./sources/sui/reader";
import type { SuiGraphqlClient } from "./sources/sui/rpc";
import { KrakenReader } from "./sources/exchange/kraken-reader";
import type { KrakenClient } from "./sources/exchange/kraken-client";
import { BitGoCustodianAdapter } from "./sources/custodian";
import { BitGoReader } from "./sources/custodian/bitgo-reader";
import type { BitGoClient } from "./sources/custodian/bitgo-client";
import type { FetchSourceTransactionsQuery } from "./types";

function fixture<T>(section: string, name: string): T {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./sources/${section}/__fixtures__/${name}`, import.meta.url)), "utf8"),
  ) as T;
}

const ADDRESS = {
  solana: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
  evm: "0x28C6c06298d514Db089934071355E5743bf21d60",
  bitcoin: "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97",
  sui: "0x0feb54a725aa357ff2f5bc6bb023c05b310285bd861275a30521f339a434ebb3",
};
const WINDOW = { since: "2024-01-01", until: "2026-12-31" };

// --- Solana -----------------------------------------------------------------
const solanaBalance = fixture<{ result: unknown }>("solana", "balance.json").result;
const solanaTokens = fixture<{ result: unknown }>("solana", "tokens.json").result;
const solanaSignatures = fixture<{ result: unknown }>("solana", "signatures.json").result;
const solanaTx = fixture<{ result: unknown }>("solana", "transaction.json").result;

const SolanaAdapter = new SolanaChainAdapter({
  client: {
    call: async (method: string) => {
      if (method === "getBalance") return solanaBalance;
      if (method === "getTokenAccountsByOwner") return solanaTokens;
      if (method === "getSignaturesForAddress") return solanaSignatures;
      if (method === "getTransaction") return solanaTx;
      throw new Error(`unexpected ${method}`);
    },
  } as never,
});

// --- EVM --------------------------------------------------------------------
const evmBalance = fixture<{ result: string }>("evm", "balance.json").result;
const evmTokens = fixture<{ result: unknown }>("evm", "token-balances.json").result;
const evmTransfers = fixture<{ result: unknown }>("evm", "transfers.json").result;

const evmReader = new EvmReader(evmChain("ethereum")!, {
  enhanced: true,
  call: async (method: string) => {
    if (method === "eth_getBalance") return evmBalance;
    if (method === "alchemy_getTokenBalances") return evmTokens;
    if (method === "alchemy_getAssetTransfers") return evmTransfers;
    throw new Error(`unexpected ${method}`);
  },
} as never);
const EthereumAdapter = new EthereumChainAdapter({ reader: evmReader });
const PolygonAdapter = new PolygonChainAdapter({ reader: evmReader });

// --- Bitcoin ----------------------------------------------------------------
const btcAddress = fixture<unknown>("bitcoin", "address.json");
const btcTxs = fixture<unknown[]>("bitcoin", "txs.json");
const btcReader = new BitcoinReader({
  baseUrl: "https://fixture",
  get: async (path: string) => (path.includes("/txs") ? btcTxs : btcAddress),
} as unknown as EsploraClient);
const BitcoinAdapter = new BitcoinChainAdapter({ reader: btcReader });

// --- Sui --------------------------------------------------------------------
const suiBalances = fixture<{ data: unknown }>("sui", "balances.graphql.json").data;
const suiTxs = fixture<{ data: unknown }>("sui", "transactions.graphql.json").data;
let suiTxPage = 0;
const suiReader = new SuiReader({
  query: async (q: string) => {
    if (q.includes("SuiBalances")) return suiBalances;
    // One page only; the reader stops when hasPreviousPage is false.
    suiTxPage += 1;
    if (suiTxPage > 1) return { address: { transactions: { pageInfo: { hasPreviousPage: false, startCursor: null }, nodes: [] } } };
    return suiTxs;
  },
} as unknown as SuiGraphqlClient);
const SuiAdapter = new SuiChainAdapter({ reader: suiReader });

// --- Kraken (exchange) ------------------------------------------------------
const krakenAssets = fixture<{ result: unknown }>("exchange", "assets.json").result;
const krakenBalance = fixture<{ result: unknown }>("exchange", "balance.json").result;
const krakenLedgers = fixture<{ result: unknown }>("exchange", "ledgers.json").result;
const krakenTrades = fixture<{ result: unknown }>("exchange", "trades.json").result;
const krakenReader = new KrakenReader({
  getAssets: async () => krakenAssets,
  getBalance: async () => ({ error: [], result: krakenBalance }),
  getLedgers: async () => ({ error: [], result: krakenLedgers }),
  getTradesHistory: async () => ({ error: [], result: krakenTrades }),
} as unknown as KrakenClient);
// Drive the contract through a connector backed by the faked reader.
const KrakenContractAdapter = {
  fetchBalances: () => krakenReader.fetchBalances(),
  fetchTransactions: (query: FetchSourceTransactionsQuery) => krakenReader.fetchTransactions(query.since, query.until),
  listAccounts: async () => [{ externalAccountId: "kraken-main", name: "Kraken account", chain: "kraken" }],
};

// --- BitGo (custodian) ------------------------------------------------------
const bitgoBalances = fixture<unknown>("custodian", "bitgo-balances.json");
const bitgoWallets = fixture<unknown>("custodian", "bitgo-wallets.json");
const bitgoTransfers = fixture<unknown>("custodian", "bitgo-transfers.json");
const bitgoReader = new BitGoReader({
  getBalances: async () => bitgoBalances,
  getWallets: async () => bitgoWallets,
  getTransfers: async () => bitgoTransfers,
} as unknown as BitGoClient);
const BitGoAdapter = new BitGoCustodianAdapter({ reader: bitgoReader });

// --- Fireblocks (custodian) -------------------------------------------------
const fbAccounts = fixture<unknown>("custodian", "accounts.json");
const fbTxs = fixture<unknown>("custodian", "transactions.json");
const fireblocksReader = new (await import("./sources/custodian/fireblocks-reader")).FireblocksReader({
  getVaultAccounts: async () => fbAccounts,
  getTransactions: async () => fbTxs,
  getVaultAccount: async () => (fbAccounts as { accounts: unknown[] }).accounts[0],
} as never);
const { FireblocksCustodianAdapter } = await import("./sources/custodian");
const FireblocksAdapter = new FireblocksCustodianAdapter({ reader: fireblocksReader });

// --- Remaining exchange venues ----------------------------------------------
// Every venue shares VenueExchangeAdapter, so each is driven through it with a
// fake fetch that returns minimal valid payloads per endpoint.
const { VenueExchangeAdapter } = await import("./sources/exchange");
const { VENUES } = await import("./sources/exchange/registry");

function venueFetch(payloads: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL | Request) => {
    const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    for (const [fragment, body] of Object.entries(payloads)) {
      if (href.includes(fragment)) {
        const text = typeof body === "string" ? body : JSON.stringify(body);
        return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    // Unknown read endpoint: return an empty array (valid for movement lists).
    return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}

const BybitAdapter = new VenueExchangeAdapter(VENUES.bybit!, {
  credential: { apiKey: "k", apiSecret: "s" },
  fetchImpl: venueFetch({
    "/v5/account/wallet-balance": { retCode: 0, retMsg: "OK", result: { list: [{ coin: [{ coin: "BTC", walletBalance: "0.5" }] }] } },
    "/v5/asset/transfer/query-account-coins-balance": { retCode: 0, retMsg: "OK", result: { balance: [] } },
    "/v5/asset/deposit/query-record": { retCode: 0, retMsg: "OK", result: { rows: [] } },
    "/v5/asset/withdraw/query-record": { retCode: 0, retMsg: "OK", result: { rows: [] } },
  }),
});
const BinanceAdapter = new VenueExchangeAdapter(VENUES.binance!, {
  credential: { apiKey: "k", apiSecret: "s" },
  fetchImpl: venueFetch({ "/api/v3/account": { balances: [{ asset: "ETH", free: "1.5", locked: "0" }] } }),
});
const GateAdapter = new VenueExchangeAdapter(VENUES.gate!, {
  credential: { apiKey: "k", apiSecret: "s" },
  fetchImpl: venueFetch({ "/spot/accounts": [{ currency: "USDT", available: "10", locked: "0" }] }),
});
const BackpackAdapter = new VenueExchangeAdapter(VENUES.backpack!, {
  // A valid 32-byte ED25519 seed for the signing key.
  credential: { apiKey: "k", apiSecret: "0pHS6caRnH8SvlIwvnI3/LAsSdaKWOc3YJXQ0Q8dtrI=" },
  fetchImpl: venueFetch({ "/api/v1/capital": { USDC: { available: "100.0", locked: "0" } } }),
});

runAdapterContract({
  name: "Solana chain",
  adapter: SolanaAdapter,
  query: { ...WINDOW, externalAccountId: ADDRESS.solana },
  implemented: true,
  invalidQuery: {
    since: WINDOW.since,
    externalAccountId: "not-an-address",
  },
});

runAdapterContract({
  name: "Ethereum chain",
  adapter: EthereumAdapter,
  query: { ...WINDOW, externalAccountId: ADDRESS.evm },
  implemented: true,
  invalidQuery: { since: WINDOW.since, externalAccountId: "not-an-address" },
});

runAdapterContract({
  name: "Polygon chain",
  adapter: PolygonAdapter,
  query: { ...WINDOW, externalAccountId: ADDRESS.evm },
  implemented: true,
  invalidQuery: { since: WINDOW.since, externalAccountId: "not-an-address" },
});

runAdapterContract({
  name: "Bitcoin chain",
  adapter: BitcoinAdapter,
  query: { ...WINDOW, externalAccountId: ADDRESS.bitcoin },
  implemented: true,
  invalidQuery: { since: WINDOW.since, externalAccountId: "not-an-address" },
});

runAdapterContract({
  name: "Sui chain",
  adapter: SuiAdapter,
  query: { ...WINDOW, externalAccountId: ADDRESS.sui },
  implemented: true,
  invalidQuery: { since: WINDOW.since, externalAccountId: "not-an-address" },
});

runAdapterContract({
  name: "Kraken exchange",
  adapter: KrakenContractAdapter,
  query: { ...WINDOW, externalAccountId: "kraken-main" },
  implemented: true,
});

runAdapterContract({
  name: "BitGo custodian",
  adapter: BitGoAdapter,
  query: { ...WINDOW, externalAccountId: "btc" },
  implemented: true,
  invalidQuery: { since: WINDOW.since },
});

runAdapterContract({
  name: "Fireblocks custodian",
  adapter: FireblocksAdapter,
  query: { ...WINDOW, externalAccountId: "0" },
  implemented: true,
  invalidQuery: { since: WINDOW.since },
});

for (const [name, adapter] of [
  ["Bybit exchange", BybitAdapter],
  ["Binance exchange", BinanceAdapter],
  ["Gate.io exchange", GateAdapter],
  ["Backpack exchange", BackpackAdapter],
] as const) {
  runAdapterContract({
    name,
    adapter,
    query: { ...WINDOW, externalAccountId: "acct-1" },
    implemented: true,
  });
}

describe("contract coverage: every registered source adapter has a case", () => {
  it("every exchange venue in the registry is covered", async () => {
    const { VENUE_KEYS } = await import("./sources/exchange/registry");
    const covered = new Set(["kraken", "bybit", "binance", "gate", "backpack"]);
    for (const key of VENUE_KEYS) expect(covered.has(key)).toBe(true);
  });

  it("every custodian in the registry is covered", async () => {
    const { CUSTODIAN_KEYS } = await import("./sources/custodian/registry");
    const covered = new Set(["bitgo", "fireblocks"]);
    for (const key of CUSTODIAN_KEYS) expect(covered.has(key)).toBe(true);
  });

  it("the generic exchange stub rejects with a stub error", async () => {
    const stub = new ExchangeSourceAdapter();
    const query: FetchSourceTransactionsQuery = { since: WINDOW.since };
    await expect(stub.fetchBalances(query)).rejects.toThrow(/stub/i);
    await expect(stub.fetchTransactions(query)).rejects.toThrow(/stub/i);
  });

  it("the generic custodian stub rejects with a stub error", async () => {
    const stub = new CustodianSourceAdapter();
    const query: FetchSourceTransactionsQuery = { since: WINDOW.since };
    await expect(stub.fetchBalances(query)).rejects.toThrow(/stub/i);
  });
});

describe("contract validators reject malformed output", () => {
  it("rejects a bad balance and a bad movement", () => {
    expect(validateBalances([{ assetCode: "", quantityMinor: 1n, asOf: "nope" }]).ok).toBe(false);
    expect(
      validateTransactions([
        { externalId: "x", occurredOn: "2024-1-1", assetCode: "BTC", direction: "in", quantityMinor: 0n, description: "" },
      ]).ok,
    ).toBe(false);
  });
});
