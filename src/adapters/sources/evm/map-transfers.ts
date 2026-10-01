/**
 * Turn Alchemy asset transfers into ledger movements for a watched address.
 * Each transfer is one in or out movement. Native transfers use the chain's
 * native asset; ERC-20 transfers resolve through the token registry, and
 * unknown tokens are skipped. The external id is the Alchemy `uniqueId`, which
 * is unique per transfer and satisfies the source-transaction unique index.
 */
import type { NormalizedSourceTransaction } from "../../types";
import { hexToMinorUnits } from "./amounts";
import type { EvmChain } from "./chains";
import type { AssetTransfer } from "./evm-responses";
import { resolveToken } from "./tokens";

export function mapTransfers(
  chain: EvmChain,
  transfers: readonly AssetTransfer[],
  watchedAddress: string,
): NormalizedSourceTransaction[] {
  const watched = watchedAddress.toLowerCase();
  const movements: NormalizedSourceTransaction[] = [];

  for (const transfer of transfers) {
    const from = transfer.from?.toLowerCase() ?? null;
    const to = transfer.to?.toLowerCase() ?? null;
    const isIn = to === watched && from !== watched;
    const isOut = from === watched && to !== watched;
    if (!isIn && !isOut) continue;

    const assetCode = transfer.category === "external" ? chain.nativeCode : resolveToken(chain, transfer.rawContract.address ?? "")?.code;
    if (!assetCode) continue;

    const raw = transfer.rawContract.value;
    if (raw === null) continue;

    const occurredOn = transfer.metadata?.blockTimestamp?.slice(0, 10);
    if (!occurredOn) continue;

    movements.push({
      externalId: transfer.uniqueId,
      occurredOn,
      assetCode,
      direction: isIn ? "in" : "out",
      quantityMinor: hexToMinorUnits(raw),
      description: isIn
        ? `${chain.name} receipt of ${assetCode}.`
        : `${chain.name} transfer of ${assetCode}.`,
      chain: chain.key,
    });
  }

  return movements;
}
