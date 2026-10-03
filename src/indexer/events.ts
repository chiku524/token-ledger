/**
 * Decode the contracts' anchor events from program logs and program data.
 * Anchor emits `Program data: <base64>` lines carrying the event discriminator
 * followed by Borsh-encoded fields. Decoding them gives the app a typed view of
 * what happened, but events are never the source of truth: the plan says durable
 * counters/receipts remain authoritative if logs are missed, so every decoded
 * event is reconciled against projected PDA state before it is trusted.
 *
 * Discriminators and field layouts are pinned to the committed IDLs by tests.
 */
import { fromBase64 } from "@/lib/webcrypto";

/** The 8-byte discriminators, pinned to `contracts/idl/service_balance.json`. */
export const BILLING_EVENT_DISCRIMINATORS = {
  BillingVaultCreated: [239, 47, 122, 40, 61, 181, 159, 173],
  CollectionPauseChanged: [205, 91, 12, 203, 248, 45, 244, 126],
  CollectorRotated: [99, 3, 62, 187, 111, 208, 211, 89],
  CycleCollected: [236, 45, 184, 233, 5, 176, 237, 92],
  Deposited: [111, 141, 26, 45, 161, 35, 100, 57],
  MandateActivated: [169, 1, 206, 214, 221, 108, 57, 156],
  MandateReplaced: [217, 129, 69, 180, 13, 78, 77, 232],
  MandateRevoked: [228, 111, 181, 60, 204, 58, 131, 28],
  Withdrawn: [20, 89, 223, 198, 194, 124, 219, 13],
} as const satisfies Record<string, readonly number[]>;

export type BillingEventName = keyof typeof BILLING_EVENT_DISCRIMINATORS;

export interface DecodedEvent {
  name: string;
  /** Raw field values, keyed by the IDL field name. Amounts are bigint, keys are base58. */
  fields: Record<string, string | bigint | boolean>;
  /** Ordinal within the transaction, so identical events get distinct keys. */
  ordinal: number;
}

/** The 8-byte discriminator a log line carries, base64 of the whole event payload. */
export function discriminatorOf(name: BillingEventName): Uint8Array {
  return Uint8Array.from(BILLING_EVENT_DISCRIMINATORS[name]);
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = BASE58[Number(value % 58n)] + out;
    value /= 58n;
  }
  let zeros = 0;
  for (const byte of bytes) {
    if (byte !== 0) break;
    zeros += 1;
  }
  return "1".repeat(zeros) + out;
}

interface Cursor {
  offset: number;
}

function readPubkey(data: Uint8Array, cursor: Cursor): string {
  const key = data.slice(cursor.offset, cursor.offset + 32);
  cursor.offset += 32;
  return encodeBase58(key);
}

function readU64(data: Uint8Array, cursor: Cursor): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) value |= BigInt(data[cursor.offset + index] ?? 0) << (8n * BigInt(index));
  cursor.offset += 8;
  return value;
}

function readI64(data: Uint8Array, cursor: Cursor): bigint {
  const raw = readU64(data, cursor);
  const U64_MAX = 0xffff_ffff_ffff_ffffn;
  return raw >= 0x8000_0000_0000_0000n ? raw - (U64_MAX + 1n) : raw;
}

function readBool(data: Uint8Array, cursor: Cursor): boolean {
  const value = data[cursor.offset] === 1;
  cursor.offset += 1;
  return value;
}

const FIELD_READERS: Record<string, (data: Uint8Array, cursor: Cursor) => string | bigint | boolean> = {
  vault: readPubkey,
  mandate: readPubkey,
  merchant: readPubkey,
  controller: readPubkey,
  collector: readPubkey,
  cycle: readU64,
  amount: readU64,
  generation: readU64,
  paid_through: readI64,
  coverage_start: readI64,
  coverage_end: readI64,
  paused: readBool,
};

const EVENT_FIELDS: Record<string, string[]> = {
  BillingVaultCreated: ["vault", "merchant", "controller"],
  CollectionPauseChanged: ["merchant", "paused"],
  CollectorRotated: ["merchant", "collector"],
  CycleCollected: ["mandate", "cycle", "amount", "coverage_start", "coverage_end"],
  Deposited: ["vault", "amount"],
  MandateActivated: ["vault", "mandate", "cycle", "amount", "paid_through"],
  MandateReplaced: ["vault", "mandate", "generation"],
  MandateRevoked: ["mandate"],
  Withdrawn: ["vault", "amount"],
};

/**
 * Decode the `Program data:` lines of a transaction into typed events. Lines
 * that are not events (or events from another program) are skipped. The caller
 * supplies the program id to filter on in the surrounding reader; here we decode
 * whatever matches a pinned discriminator.
 */
export function decodeEventsFromLogs(logs: readonly string[]): DecodedEvent[] {
  const events: DecodedEvent[] = [];
  let ordinal = 0;
  for (const line of logs) {
    const prefix = "Program data: ";
    if (!line.startsWith(prefix)) continue;
    let bytes: Uint8Array;
    try {
      bytes = fromBase64(line.slice(prefix.length).trim());
    } catch {
      continue;
    }
    if (bytes.length < 8) continue;
    const discriminator = bytes.slice(0, 8);
    const name = (Object.keys(BILLING_EVENT_DISCRIMINATORS) as BillingEventName[]).find((candidate) =>
      discriminatorEquals(discriminator, BILLING_EVENT_DISCRIMINATORS[candidate]),
    );
    if (!name) continue;
    const fields: Record<string, string | bigint | boolean> = {};
    const cursor: Cursor = { offset: 8 };
    let ok = true;
    for (const field of EVENT_FIELDS[name]!) {
      const reader = FIELD_READERS[field];
      if (!reader) {
        ok = false;
        break;
      }
      fields[field] = reader(bytes, cursor);
    }
    if (ok) {
      events.push({ name, fields, ordinal });
      ordinal += 1;
    }
  }
  return events;
}

function discriminatorEquals(left: Uint8Array, right: readonly number[]): boolean {
  return left.length === right.length && right.every((byte, index) => left[index] === byte);
}
