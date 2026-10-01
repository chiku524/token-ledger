/**
 * Bitcoin UTXO movement model.
 *
 * An address does not have a single balance field, so it is derived from the
 * confirmed and mempool statistics: balance = (funded - spent). Transactions
 * are turned into one net movement each, from the difference between the value
 * the watched address sent and received in that transaction:
 *
 *   net = sum(outputs paid to the address) - sum(inputs spent from the address)
 *
 * This collapses the UTXO model into the ledger's in/out movement shape:
 *
 * - Change is not a movement. Change is an output paid back to the watched
 *   address, and it appears on both sides of the transaction (it was an input
 *   and it is an output), so it nets to zero for the address.
 * - A self-transfer (all inputs and outputs are the address) nets to zero and
 *   is skipped.
 * - A receive funded by many inputs is a single inbound movement equal to the
 *   total received, which is what an accountant books.
 * - A payment that also produces change is a single outbound movement equal to
 *   the amount the address actually gave up; the change is already cancelled.
 * - The network fee is borne by the inputs, so an outbound movement includes
 *   the fee for the address that paid it.
 * - Dust outputs smaller than the spending threshold still count: Bitcoin does
 *   not distinguish dust from value here. They are left in rather than guessed
 *   away.
 *
 * The external id is `<txid>:BTC`, unique per transaction for the watched
 * address, which the source-transaction unique index requires.
 */
import type { NormalizedSourceTransaction } from "../../types";
import { satoshisToMinor } from "./amounts";
import type { EsploraTx } from "./bitcoin-responses";

export const BTC_CODE = "BTC";
export const SATOSHIS_PER_BTC = 100_000_000;

export function mapBitcoinBalance(addressData: {
  chain_stats: { funded_txo_sum: number; spent_txo_sum: number };
  mempool_stats: { funded_txo_sum: number; spent_txo_sum: number };
}): bigint {
  const confirmed = BigInt(addressData.chain_stats.funded_txo_sum - addressData.chain_stats.spent_txo_sum);
  const pending = BigInt(addressData.mempool_stats.funded_txo_sum - addressData.mempool_stats.spent_txo_sum);
  return confirmed + pending;
}

export function mapBitcoinTransaction(
  tx: EsploraTx,
  watchedAddress: string,
): NormalizedSourceTransaction | null {
  // A transaction with no confirmation time cannot be dated; skip it.
  if (!tx.status.confirmed || typeof tx.status.block_time !== "number") return null;

  const received = tx.vout
    .filter((output) => output.scriptpubkey_address === watchedAddress)
    .reduce((sum, output) => sum + output.value, 0);
  const spent = tx.vin
    .filter((input) => input.prevout?.scriptpubkey_address === watchedAddress)
    .reduce((sum, input) => sum + (input.prevout?.value ?? 0), 0);

  const net = satoshisToMinor(received) - satoshisToMinor(spent);
  if (net === 0n) return null;

  const occurredOn = new Date(tx.status.block_time * 1000).toISOString().slice(0, 10);
  return {
    externalId: `${tx.txid}:${BTC_CODE}`,
    occurredOn,
    assetCode: BTC_CODE,
    direction: net > 0n ? "in" : "out",
    quantityMinor: net > 0n ? net : -net,
    description: net > 0n ? "Bitcoin received." : "Bitcoin sent.",
    chain: "bitcoin",
  };
}
