/**
 * Bitcoin address shapes. This checks the well-known textual forms rather than
 * full checksum verification: base58check (P2PKH `1…`, P2SH `3…`), bech32
 * (P2WPKH/P2WSH `bc1q…`), and bech32m (P2TR `bc1p…`). Mainnet only; a full
 * checksum belongs with a real indexer integration.
 */

const BASE58 = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
const BECH32 = /^(bc1)[02-9ac-hj-np-z]{11,71}$/;
const BECH32M_TAPROOT = /^bc1p[02-9ac-hj-np-z]{58}$/;

export function isValidBitcoinAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const address = value.trim();
  return BASE58.test(address) || BECH32M_TAPROOT.test(address) || BECH32.test(address);
}
