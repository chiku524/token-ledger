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
}

/** A credential as stored: sealed blobs plus a redacted hint. */
export interface SealedExchangeCredential {
  keyHint: string;
  sealedKey: string;
  sealedSecret: string;
}

export function sealExchangeCredential(input: ExchangeCredentialInput, passphrase?: string): SealedExchangeCredential {
  const key = input.apiKey.trim();
  const secret = input.apiSecret.trim();
  if (key.length === 0 || secret.length === 0) {
    throw new Error("An exchange API key and secret are both required.");
  }
  const pass = passphrase ?? readConnectorEncryptionKey();
  return {
    keyHint: redactSecret(key),
    sealedKey: sealSecret(key, pass),
    sealedSecret: sealSecret(secret, pass),
  };
}

export function openExchangeCredential(
  sealed: { sealedKey: string; sealedSecret: string },
  passphrase?: string,
): ExchangeCredentialInput {
  const pass = passphrase ?? readConnectorEncryptionKey();
  return {
    apiKey: openSecret(sealed.sealedKey, pass),
    apiSecret: openSecret(sealed.sealedSecret, pass),
  };
}

/** A redacted view safe to pass to a page or server component. */
export function credentialSummary(sealed: { keyHint: string }): { keyHint: string } {
  return { keyHint: sealed.keyHint };
}
