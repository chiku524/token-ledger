import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EsploraAddress, EsploraTx } from "./bitcoin-responses";
import { mapBitcoinBalance, mapBitcoinTransaction } from "./map";

const WATCHED = "bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97";
const OTHER = "bc1q0apu0zjzjpx7x8fnx7ktrnvhfytj9pjf2vzpun";

function fixture<T>(name: string): T {
  return JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), "utf8")) as T;
}

const address = fixture<EsploraAddress>("address.json");
const txs = fixture<EsploraTx[]>("txs.json");

describe("mapBitcoinBalance", () => {
  it("derives the balance from confirmed plus mempool funded-minus-spent", () => {
    expect(mapBitcoinBalance(address)).toBe(
      BigInt(address.chain_stats.funded_txo_sum - address.chain_stats.spent_txo_sum + address.mempool_stats.funded_txo_sum - address.mempool_stats.spent_txo_sum),
    );
  });

  it("counts pending mempool value and can be zero", () => {
    const empty = { chain_stats: { funded_txo_sum: 100, spent_txo_sum: 100 }, mempool_stats: { funded_txo_sum: 0, spent_txo_sum: 0 } };
    expect(mapBitcoinBalance(empty)).toBe(0n);
  });
});

describe("mapBitcoinTransaction", () => {
  it("maps a real incoming transaction to a single inbound movement", () => {
    const incoming = txs.find((tx) => tx.vout.some((output) => output.scriptpubkey_address === WATCHED));
    expect(incoming).toBeDefined();
    const movement = mapBitcoinTransaction(incoming!, WATCHED);
    expect(movement).toMatchObject({ assetCode: "BTC", direction: "in", chain: "bitcoin" });
    expect(movement!.quantityMinor).toBeGreaterThan(0n);
    expect(movement!.externalId).toBe(`${incoming!.txid}:BTC`);
  });

  it("nets a payment with change into one outbound amount (change excluded)", () => {
    // 1.0 BTC in, 0.6 to a merchant, 0.39 change back to the watched address.
    const tx = makeTx({
      inputs: [{ address: WATCHED, value: 100_000_000 }],
      outputs: [
        { address: OTHER, value: 60_000_000 },
        { address: WATCHED, value: 39_000_000 },
      ],
    });
    const movement = mapBitcoinTransaction(tx, WATCHED);
    expect(movement).toMatchObject({ direction: "out", quantityMinor: 61_000_000n });
  });

  it("skips a self-transfer whose net is zero", () => {
    const tx = makeTx({
      inputs: [{ address: WATCHED, value: 50_000_000 }],
      outputs: [{ address: WATCHED, value: 50_000_000 }],
    });
    expect(mapBitcoinTransaction(tx, WATCHED)).toBeNull();
  });

  it("represents a many-input receive as one inbound total", () => {
    const tx = makeTx({
      inputs: [
        { address: OTHER, value: 10_000_000 },
        { address: OTHER, value: 20_000_000 },
      ],
      outputs: [{ address: WATCHED, value: 29_000_000 }],
    });
    const movement = mapBitcoinTransaction(tx, WATCHED);
    expect(movement).toMatchObject({ direction: "in", quantityMinor: 29_000_000n });
  });

  it("ignores a transaction that does not involve the address and unconfirmed ones", () => {
    const unrelated = makeTx({ inputs: [{ address: OTHER, value: 1 }], outputs: [{ address: OTHER, value: 1 }] });
    expect(mapBitcoinTransaction(unrelated, WATCHED)).toBeNull();
    const unconfirmed = makeTx({
      inputs: [{ address: WATCHED, value: 1 }],
      outputs: [{ address: OTHER, value: 1 }],
      confirmed: false,
    });
    expect(mapBitcoinTransaction(unconfirmed, WATCHED)).toBeNull();
  });
});

function makeTx({
  inputs,
  outputs,
  confirmed = true,
}: {
  inputs: Array<{ address: string; value: number }>;
  outputs: Array<{ address: string; value: number }>;
  confirmed?: boolean;
}): EsploraTx {
  return {
    txid: "tx-" + Math.random().toString(16).slice(2),
    vin: inputs.map((input) => ({
      txid: "prev",
      vout: 0,
      prevout: { scriptpubkey: "", scriptpubkey_address: input.address, value: input.value },
    })),
    vout: outputs.map((output) => ({ scriptpubkey: "", scriptpubkey_address: output.address, value: output.value })),
    status: confirmed ? { confirmed: true, block_height: 1, block_time: 1_700_000_000 } : { confirmed: false },
    fee: 0,
  } as EsploraTx;
}
