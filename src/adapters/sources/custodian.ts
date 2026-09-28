/**
 * STUB custodian adapter. No custodian SDK and no API key.
 * A live implementation should read vault movements for a named custodian.
 */
import { AdapterNotImplementedError } from "../errors";
import type {
  AdapterDescriptor,
  CustodianSourceAdapter as CustodianSourcePort,
  FetchSourceTransactionsQuery,
  NormalizedSourceTransaction,
} from "../types";

export class CustodianSourceAdapter implements CustodianSourcePort {
  readonly kind = "custodian" as const;
  readonly implemented = false as const;
  readonly descriptor: AdapterDescriptor = {
    name: "Custodian source adapter",
    category: "custodian",
    system: "custodian",
    implemented: false,
    summary: "Pull vault movements from a digital-asset custodian. Stub only — no custodian is called.",
  };

  fetchTransactions(_query: FetchSourceTransactionsQuery): Promise<NormalizedSourceTransaction[]> {
    return Promise.reject(new AdapterNotImplementedError(this.descriptor.name));
  }
}
