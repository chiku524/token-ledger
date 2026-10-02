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

/** WalletConnect / Reown is optional. Without a project id the modal stays off. */
export function reownProjectId(env: { NEXT_PUBLIC_REOWN_PROJECT_ID?: string } = { NEXT_PUBLIC_REOWN_PROJECT_ID: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID }): string | null {
  const id = env.NEXT_PUBLIC_REOWN_PROJECT_ID?.trim() ?? "";
  return id.length > 0 ? id : null;
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

/**
 * Required to store or read connector credentials (exchange API keys). At least
 * 32 characters, server-only. Derives the AES-256-GCM key that seals secrets at
 * rest. Never sent to the browser and never logged.
 */
export function readConnectorEncryptionKey(
  env: { CONNECTOR_ENCRYPTION_KEY?: string } = { CONNECTOR_ENCRYPTION_KEY: process.env.CONNECTOR_ENCRYPTION_KEY },
): string {
  const key = env.CONNECTOR_ENCRYPTION_KEY?.trim() ?? "";
  if (key.length < 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must be at least 32 characters.");
  }
  return key;
}

export function connectorEncryptionConfigured(
  env: { CONNECTOR_ENCRYPTION_KEY?: string } = { CONNECTOR_ENCRYPTION_KEY: process.env.CONNECTOR_ENCRYPTION_KEY },
): boolean {
  return (env.CONNECTOR_ENCRYPTION_KEY?.trim().length ?? 0) >= 32;
}

/**
 * Optional. When set, the scheduled sync route requires it as a bearer token, so
 * only the scheduler can trigger a pass. Vercel Cron sends the matching
 * `CRON_SECRET` automatically. At least 16 characters.
 */
export function readCronSecret(
  env: { CRON_SECRET?: string } = { CRON_SECRET: process.env.CRON_SECRET },
): string | null {
  const secret = env.CRON_SECRET?.trim() ?? "";
  if (secret === "") return null;
  if (secret.length < 16) throw new Error("CRON_SECRET must be at least 16 characters.");
  return secret;
}

/**
 * Required to accept signed source webhooks. At least 32 characters,
 * server-only. A per-source signing secret is derived from it, so the source
 * never shares the raw value. See docs/adr-scheduled-ingestion.md.
 */
export function readWebhookSigningSecret(
  env: { WEBHOOK_SIGNING_SECRET?: string } = { WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET },
): string {
  const secret = env.WEBHOOK_SIGNING_SECRET?.trim() ?? "";
  if (secret.length < 32) {
    throw new Error("WEBHOOK_SIGNING_SECRET must be at least 32 characters.");
  }
  return secret;
}

export function webhookSigningConfigured(
  env: { WEBHOOK_SIGNING_SECRET?: string } = { WEBHOOK_SIGNING_SECRET: process.env.WEBHOOK_SIGNING_SECRET },
): boolean {
  return (env.WEBHOOK_SIGNING_SECRET?.trim().length ?? 0) >= 32;
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

/** The free, keyless public Sui GraphQL endpoint. See docs/adr-sui-data-source.md. */
export const SUI_PUBLIC_GRAPHQL_URL = "https://graphql.mainnet.sui.io/graphql";

/**
 * Transactional email. Optional: when unset, email is not sent and a flow falls
 * back to showing the link on screen (invites) or logging the token (dev). Set
 * RESEND_API_KEY and EMAIL_FROM to send. See docs/adr-email.md.
 */
export function readResendApiKey(
  env: { RESEND_API_KEY?: string } = { RESEND_API_KEY: process.env.RESEND_API_KEY },
): string | null {
  const raw = env.RESEND_API_KEY;
  if (raw === undefined || raw.trim() === "") return null;
  return raw.trim();
}

export function readEmailFrom(
  env: { EMAIL_FROM?: string; EMAIL_FROM_NAME?: string } = {
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  },
): { email: string; name: string } | null {
  const email = env.EMAIL_FROM?.trim() ?? "";
  if (email === "") return null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("EMAIL_FROM must be an email address.");
  return { email, name: env.EMAIL_FROM_NAME?.trim() || "Token Ledger" };
}

/**
 * Optional. A Sui GraphQL endpoint. Unset uses the keyless public endpoint
 * (`https://graphql.mainnet.sui.io/graphql`) or a provider via this variable.
 * Must be https with no embedded credentials.
 */
export function readSuiGraphqlUrl(
  env: { SUI_RPC_URL?: string } = { SUI_RPC_URL: process.env.SUI_RPC_URL },
): string {
  const raw = env.SUI_RPC_URL;
  if (raw === undefined || raw.trim() === "") return SUI_PUBLIC_GRAPHQL_URL;
  const url = raw.trim();
  if (!/^https:\/\//i.test(url)) {
    throw new Error("SUI_RPC_URL must be an https:// URL.");
  }
  if (new URL(url).username !== "" || new URL(url).password !== "") {
    throw new Error("SUI_RPC_URL must not embed credentials in the URL.");
  }
  return url;
}
