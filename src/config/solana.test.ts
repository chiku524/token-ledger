import { describe, expect, it } from "vitest";
import { contractsConfigured, SPL_TOKEN_PROGRAM, solanaDeployment, USDC_DECIMALS } from "./solana";

// Valid base58 32-byte addresses for tests.
const PROGRAM_A = "DVRsqtJNpDA31QRdoSkfGb2wynCWs4cWoe3NCSNjpeXb";
const PROGRAM_B = "33YoPF5P1v9qkgMpzPTHtWnCcA9u9eE9iv6xutWRyZCs";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const base = {
  SOLANA_CONTRACTS_CLUSTER: "devnet",
  SERVICE_BALANCE_PROGRAM_ID: PROGRAM_A,
  TREASURY_PAYABLES_PROGRAM_ID: PROGRAM_B,
  USDC_MINT: MINT,
};

describe("solanaDeployment", () => {
  it("is off when no cluster is configured", () => {
    expect(solanaDeployment({})).toBeNull();
    expect(solanaDeployment({ SOLANA_CONTRACTS_CLUSTER: "  " })).toBeNull();
    expect(contractsConfigured({})).toBe(false);
  });

  it("reads a complete deployment and defaults the token program", () => {
    const deployment = solanaDeployment(base);
    expect(deployment).not.toBeNull();
    expect(deployment!.cluster).toBe("devnet");
    expect(deployment!.serviceBalanceProgram).toBe(PROGRAM_A);
    expect(deployment!.treasuryPayablesProgram).toBe(PROGRAM_B);
    expect(deployment!.usdcMint).toBe(MINT);
    expect(deployment!.tokenProgram).toBe(SPL_TOKEN_PROGRAM);
    expect(deployment!.rpcUrl).toBe("https://api.devnet.solana.com");
    expect(USDC_DECIMALS).toBe(6);
  });

  it("honours an explicit RPC and token program", () => {
    const deployment = solanaDeployment({
      ...base,
      SOLANA_RPC_URL: "https://rpc.example.com",
      SPL_TOKEN_PROGRAM_ID: SPL_TOKEN_PROGRAM,
    });
    expect(deployment!.rpcUrl).toBe("https://rpc.example.com");
  });

  it("rejects an unknown cluster", () => {
    expect(() => solanaDeployment({ ...base, SOLANA_CONTRACTS_CLUSTER: "testnet" })).toThrow(/cluster/i);
  });

  it("rejects a missing or malformed program id", () => {
    const { SERVICE_BALANCE_PROGRAM_ID: _omit, ...missing } = base;
    expect(() => solanaDeployment(missing)).toThrow(/SERVICE_BALANCE_PROGRAM_ID/);
    expect(() => solanaDeployment({ ...base, TREASURY_PAYABLES_PROGRAM_ID: "not-an-address" })).toThrow(
      /TREASURY_PAYABLES_PROGRAM_ID/,
    );
    expect(() => solanaDeployment({ ...base, USDC_MINT: "0OIl" })).toThrow(/USDC_MINT/);
  });

  it("rejects an RPC that embeds credentials or is not https", () => {
    expect(() => solanaDeployment({ ...base, SOLANA_RPC_URL: "http://rpc.example.com" })).toThrow(/https/i);
    expect(() => solanaDeployment({ ...base, SOLANA_RPC_URL: "https://user:pass@rpc.example.com" })).toThrow(
      /credentials/i,
    );
  });

  it("reads optional merchant config, defaulting to null and rejecting a malformed address", () => {
    expect(solanaDeployment(base)!.merchantAdmin).toBeNull();
    expect(solanaDeployment(base)!.merchantDestination).toBeNull();
    const withMerchant = solanaDeployment({
      ...base,
      MERCHANT_ADMIN_ADDRESS: PROGRAM_A,
      MERCHANT_DESTINATION_TOKEN_ACCOUNT: PROGRAM_B,
    });
    expect(withMerchant!.merchantAdmin).toBe(PROGRAM_A);
    expect(withMerchant!.merchantDestination).toBe(PROGRAM_B);
    expect(() => solanaDeployment({ ...base, MERCHANT_ADMIN_ADDRESS: "not-an-address" })).toThrow(/MERCHANT_ADMIN_ADDRESS/);
  });

  it("treats a set-but-malformed deployment as configured so callers read and see the error", () => {
    expect(contractsConfigured({ SOLANA_CONTRACTS_CLUSTER: "devnet" })).toBe(true);
  });
});
