import { describe, expect, it } from "vitest";
import {
  findProgramAddress,
  invoiceKeyFromHex,
  seedBillingVault,
  seedBillingVaultToken,
  seedChargeReceipt,
  seedMandate,
  seedMerchant,
  u32Seed,
  u64Seed,
} from "./pda";

// The devnet `service_balance` program. The expected addresses below were
// produced by @solana/web3.js `findProgramAddressSync` for the same seeds, so
// this proves our derivation matches the runtime exactly.
const PROGRAM = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";
const ADMIN = "7hobWVCH1mVBtedRndouStN2ku5UF6E2Zb1gCHqexeRp";

const MERCHANT = "HGkuzNQECFbbyKpANTufU1ppBBDaYnTCFaoVUYqrfFYR";
const VAULT = "3JcrKcfNSY4Y8kAZ1khafPwyLteL9sKxTbNUFCZ4FUnj";
const VAULT_TOKEN = "Bvka1fZcSSkzQP5ZTK8DFM7GBFnpzx81TbayZ91a79A7";
const MANDATE = "6XzLZo8XPFte6hw9MhcK7pmjFfTiyFEhpn4ebCzAo2iG";
const RECEIPT_0 = "3pJmq7Bv1a14vkNPyTps2NG9vJ9u7GN95xpbt31Q4KLD";
const RECEIPT_1 = "2kj4m799Ht55GWewbYo8Nvf78KeiE2ncT8EJ8ZDDV2tz";

describe("findProgramAddress", () => {
  it("matches the runtime for the merchant PDA", async () => {
    const { address } = await findProgramAddress(seedMerchant(ADMIN), PROGRAM);
    expect(address).toBe(MERCHANT);
  });

  it("derives the vault, token, mandate and receipt PDAs the program uses", async () => {
    expect((await findProgramAddress(seedBillingVault(MERCHANT, ADMIN), PROGRAM)).address).toBe(VAULT);
    expect((await findProgramAddress(seedBillingVaultToken(VAULT), PROGRAM)).address).toBe(VAULT_TOKEN);
    expect((await findProgramAddress(seedMandate(VAULT), PROGRAM)).address).toBe(MANDATE);
    expect((await findProgramAddress(seedChargeReceipt(MANDATE, 0n), PROGRAM)).address).toBe(RECEIPT_0);
    expect((await findProgramAddress(seedChargeReceipt(MANDATE, 1n), PROGRAM)).address).toBe(RECEIPT_1);
  });

  it("rejects a non-address program id", async () => {
    await expect(findProgramAddress(seedMerchant(ADMIN), "not-an-address")).rejects.toThrow(/base58|address/i);
  });
});

describe("seed encoders", () => {
  it("encodes u64 and u32 little-endian", () => {
    expect([...u64Seed(1n)]).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect([...u64Seed(0x0102030405060708n)]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect([...u32Seed(0x01020304)]).toEqual([4, 3, 2, 1]);
    expect(() => u64Seed(-1n)).toThrow();
    expect(() => u32Seed(-1)).toThrow();
  });

  it("parses a 32-byte invoice key from hex", () => {
    const key = invoiceKeyFromHex("0x" + "ab".repeat(32));
    expect(key.length).toBe(32);
    expect(key[0]).toBe(0xab);
    expect(() => invoiceKeyFromHex("abcd")).toThrow();
  });
});
