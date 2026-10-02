/**
 * Browser wallet calls used to prove control of an address.
 * These functions never request a transfer, a transaction, or a key export.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

export interface SolanaSigner {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array): Promise<Uint8Array | { signature: Uint8Array }>;
}

const EVM_METHODS = ["eth_requestAccounts", "personal_sign"] as const;

export async function connectEvm(provider: Eip1193Provider): Promise<string> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = Array.isArray(accounts) ? accounts[0] : null;
  if (typeof address !== "string" || address.length === 0) {
    throw new Error("The wallet did not share an address.");
  }
  return address;
}

export async function signEvm(provider: Eip1193Provider, address: string, message: string): Promise<string> {
  const signature = await provider.request({ method: "personal_sign", params: [message, address] });
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("The wallet did not return a signature.");
  }
  return signature;
}

export async function signSolana(provider: SolanaSigner, message: string): Promise<{ address: string; signature: string }> {
  const connected = await provider.connect();
  const address = connected.publicKey.toString();
  const signed = await provider.signMessage(new TextEncoder().encode(message));
  const bytes = signed instanceof Uint8Array ? signed : signed.signature;
  return { address, signature: bytesToHex(bytes) };
}

export function evmMethodsAllowed(method: string): boolean {
  return (EVM_METHODS as readonly string[]).includes(method);
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
