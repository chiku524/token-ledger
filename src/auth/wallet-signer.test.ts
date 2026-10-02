import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { verifyOwnershipSignature, buildOwnershipMessage } from "./wallet-ownership";
import { connectEvm, evmMethodsAllowed, signEvm, signSolana, type Eip1193Provider, type SolanaSigner } from "./wallet-signer";
import { ed25519 } from "@noble/curves/ed25519.js";
import { base58 } from "@scure/base";

describe("wallet signer", () => {
  it("asks an injected Ethereum wallet only for the account and a personal_sign", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const calls: string[] = [];
    const provider: Eip1193Provider = {
      async request({ method, params }) {
        calls.push(method);
        expect(evmMethodsAllowed(method)).toBe(true);
        if (method === "eth_requestAccounts") return [account.address];
        const message = String(params?.[0] ?? "");
        return account.signMessage({ message });
      },
    };
    const address = await connectEvm(provider);
    const message = buildOwnershipMessage({
      domain: "ledger.example",
      organizationId: "org_1",
      chain: "ethereum",
      address,
      nonce: "n",
      expiresAt: new Date("2026-10-02T12:00:00.000Z"),
    });
    const signature = await signEvm(provider, address, message);
    expect(calls).toEqual(["eth_requestAccounts", "personal_sign"]);
    expect(await verifyOwnershipSignature("ethereum", address, message, signature)).toBe(true);
  });

  it("asks Phantom only to connect and sign a message", async () => {
    const { secretKey, publicKey } = ed25519.keygen();
    const calls: string[] = [];
    const provider: SolanaSigner = {
      async connect() {
        calls.push("connect");
        return { publicKey: { toString: () => base58.encode(publicKey) } };
      },
      async signMessage(message) {
        calls.push("signMessage");
        return ed25519.sign(message, secretKey);
      },
    };
    const message = "Token Ledger ownership\nThis signature proves control of the address. It does not authorize a transfer.";
    const signed = await signSolana(provider, message);
    expect(calls).toEqual(["connect", "signMessage"]);
    expect(await verifyOwnershipSignature("solana", signed.address, message, signed.signature)).toBe(true);
  });
});
