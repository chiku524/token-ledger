/**
 * Credential persistence. Sealed blobs only; plaintext never reaches the
 * database. Reading a credential returns the sealed row, which the caller opens
 * in server code just before using it.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { connectionCredentials } from "@/db/schema";
import { openExchangeCredential, sealExchangeCredential, type ExchangeCredentialInput } from "@/adapters/credentials/store";

export interface StoredCredential {
  id: string;
  organizationId: string;
  connectionId: string;
  keyHint: string;
  sealedKey: string;
  sealedSecret: string;
}

/** Store or replace the credential for one connection. */
export async function putConnectionCredential(
  organizationId: string,
  connectionId: string,
  input: ExchangeCredentialInput,
): Promise<{ keyHint: string }> {
  const sealed = sealExchangeCredential(input);
  const db = getDb();
  const existing = await db
    .select({ id: connectionCredentials.id })
    .from(connectionCredentials)
    .where(and(eq(connectionCredentials.organizationId, organizationId), eq(connectionCredentials.connectionId, connectionId)))
    .limit(1);

  if (existing[0]) {
    await db
      .update(connectionCredentials)
      .set({ keyHint: sealed.keyHint, sealedKey: sealed.sealedKey, sealedSecret: sealed.sealedSecret, updatedAt: new Date() })
      .where(eq(connectionCredentials.id, existing[0].id));
  } else {
    await db.insert(connectionCredentials).values({
      id: `cred_${crypto.randomUUID()}`,
      organizationId,
      connectionId,
      keyHint: sealed.keyHint,
      sealedKey: sealed.sealedKey,
      sealedSecret: sealed.sealedSecret,
    });
  }
  return { keyHint: sealed.keyHint };
}

export async function getConnectionCredential(
  organizationId: string,
  connectionId: string,
): Promise<StoredCredential | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(connectionCredentials)
    .where(and(eq(connectionCredentials.organizationId, organizationId), eq(connectionCredentials.connectionId, connectionId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Open a stored credential for use in a read-only call. Never return this. */
export function openStoredCredential(stored: Pick<StoredCredential, "sealedKey" | "sealedSecret">): ExchangeCredentialInput {
  return openExchangeCredential(stored);
}

export async function deleteConnectionCredential(organizationId: string, connectionId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(connectionCredentials)
    .where(and(eq(connectionCredentials.organizationId, organizationId), eq(connectionCredentials.connectionId, connectionId)));
}
