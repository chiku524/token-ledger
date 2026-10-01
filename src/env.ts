const POSTGRES_URL = /^postgres(ql)?:\/\//i;

/** Password sessions require a secret of at least 32 characters. Demo sign-in does not. */
export function authSecretConfigured(env: { AUTH_SECRET?: string } = { AUTH_SECRET: process.env.AUTH_SECRET }): boolean {
  return (env.AUTH_SECRET?.trim().length ?? 0) >= 32;
}

export function readAuthSecret(env: { AUTH_SECRET?: string } = { AUTH_SECRET: process.env.AUTH_SECRET }): string {
  const secret = env.AUTH_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }
  return secret;
}

/** DATABASE_URL is optional. When it is set, it must be a Postgres connection string. */
export function readDatabaseUrl(env: { DATABASE_URL?: string } = { DATABASE_URL: process.env.DATABASE_URL }): string | null {
  const raw = env.DATABASE_URL;
  if (raw === undefined || raw.trim() === "") return null;
  const url = raw.trim();
  if (!POSTGRES_URL.test(url)) {
    throw new Error("DATABASE_URL must be a postgres:// or postgresql:// connection string.");
  }
  return url;
}

/** The free, keyless public cluster. See docs/adr-solana-data-source.md. */
export const SOLANA_PUBLIC_RPC_URL = "https://api.mainnet-beta.solana.com";

/**
 * Optional. A private Solana RPC endpoint (Helius, QuickNode, Chainstack, and
 * so on). Unset uses the keyless public cluster. Must be an https URL and must
 * not embed credentials.
 */
export function readSolanaRpcUrl(
  env: { SOLANA_RPC_URL?: string } = { SOLANA_RPC_URL: process.env.SOLANA_RPC_URL },
): string {
  const raw = env.SOLANA_RPC_URL;
  if (raw === undefined || raw.trim() === "") return SOLANA_PUBLIC_RPC_URL;
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error("SOLANA_RPC_URL must be an https:// URL.");
  }
  if (new URL(url).username !== "" || new URL(url).password !== "") {
    throw new Error("SOLANA_RPC_URL must not embed credentials in the URL.");
  }
  return url;
}

/**
 * Optional. An Alchemy API key unlocks EVM token balances and transfers. Unset
 * falls back to a keyless public RPC for native balances only. Read-only; no
 * signing key is involved. See docs/adr-evm-data-source.md.
 */
export function readAlchemyApiKey(
  env: { ALCHEMY_API_KEY?: string } = { ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY },
): string | null {
  const raw = env.ALCHEMY_API_KEY;
  if (raw === undefined || raw.trim() === "") return null;
  return raw.trim();
}

/**
 * Optional per-chain override. `chain` is a chain key such as `ethereum`, read
 * from `EVM_RPC_URL_ETHEREUM`. Must be https and must not embed credentials.
 */
export function readEvmRpcUrl(
  chain: string,
  env: { [key: string]: string | undefined } = process.env,
): string | null {
  const key = `EVM_RPC_URL_${chain.toUpperCase()}`;
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return null;
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`${key} must be an https:// URL.`);
  }
  if (new URL(url).username !== "" || new URL(url).password !== "") {
    throw new Error(`${key} must not embed credentials in the URL.`);
  }
  return url;
}

/** The free, keyless public Esplora instance. See docs/adr-bitcoin-data-source.md. */
export const BITCOIN_PUBLIC_ESPLORA_URL = "https://mempool.space/api";

/**
 * Optional. A self-hosted Esplora instance or Blockstream's public instance.
 * Unset uses the keyless mempool.space API. Must be https with no credentials.
 */
export function readBitcoinEsploraUrl(
  env: { BITCOIN_ESPLORA_URL?: string } = { BITCOIN_ESPLORA_URL: process.env.BITCOIN_ESPLORA_URL },
): string {
  const raw = env.BITCOIN_ESPLORA_URL;
  if (raw === undefined || raw.trim() === "") return BITCOIN_PUBLIC_ESPLORA_URL;
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error("BITCOIN_ESPLORA_URL must be an https:// URL.");
  }
  if (new URL(url).username !== "" || new URL(url).password !== "") {
    throw new Error("BITCOIN_ESPLORA_URL must not embed credentials in the URL.");
  }
  return url.replace(/\/+$/, "");
}
