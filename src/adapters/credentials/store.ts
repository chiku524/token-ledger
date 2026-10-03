/**
 * Exchange credential handling. The API key and secret are sealed before they
 * touch the database and opened only in server code that actually calls the
 * venue. Nothing here is ever sent to the browser.
 */
import { readConnectorEncryptionKey } from "@/env";
import { openSecret, redactSecret, sealSecret } from "./crypto";

/** What the user enters for a read-only exchange connection. */
export interface ExchangeCredentialInput {
  apiKey: string;
  apiSecret: string;
  /** OKX and KuCoin sign with a third value. It is sealed with the secret. */
  apiPassphrase?: string;
}

const PASSPHRASE_PREFIX = "tl-passphrase:";

/** A credential as stored: sealed blobs plus a redacted hint. */
export interface SealedExchangeCredential {
  keyHint: string;
  sealedKey: string;
  sealedSecret: string;
}

export async function sealExchangeCredential(
  input: ExchangeCredentialInput,
  passphrase?: string,
): Promise<SealedExchangeCredential> {
  const key = input.apiKey.trim();
  const secret = input.apiSecret.trim();
  if (key.length === 0 || secret.length === 0) {
    throw new Error("An exchange API key and secret are both required.");
  }
  const pass = passphrase ?? readConnectorEncryptionKey();
  return {
    keyHint: redactSecret(key),
    sealedKey: await sealSecret(key, pass),
    sealedSecret: await sealSecret(packSecret(secret, input.apiPassphrase), pass),
  };
}

export async function openExchangeCredential(
  sealed: { sealedKey: string; sealedSecret: string },
  passphrase?: string,
): Promise<ExchangeCredentialInput> {
  const pass = passphrase ?? readConnectorEncryptionKey();
  const opened = unpackSecret(await openSecret(sealed.sealedSecret, pass));
  return {
    apiKey: await openSecret(sealed.sealedKey, pass),
    apiSecret: opened.apiSecret,
    ...(opened.apiPassphrase ? { apiPassphrase: opened.apiPassphrase } : {}),
  };
}

function packSecret(secret: string, apiPassphrase?: string): string {
  const passphrase = apiPassphrase?.trim() ?? "";
  if (!passphrase) return secret;
  return PASSPHRASE_PREFIX + Buffer.from(JSON.stringify({ secret, passphrase })).toString("base64url");
}

function unpackSecret(stored: string): { apiSecret: string; apiPassphrase?: string } {
  if (!stored.startsWith(PASSPHRASE_PREFIX)) return { apiSecret: stored };
  const parsed = JSON.parse(Buffer.from(stored.slice(PASSPHRASE_PREFIX.length), "base64url").toString("utf8")) as {
    secret?: string;
    passphrase?: string;
  };
  if (!parsed.secret) return { apiSecret: stored };
  return { apiSecret: parsed.secret, ...(parsed.passphrase ? { apiPassphrase: parsed.passphrase } : {}) };
}

/** A redacted view safe to pass to a page or server component. */
export function credentialSummary(sealed: { keyHint: string }): { keyHint: string } {
  return { keyHint: sealed.keyHint };
}
