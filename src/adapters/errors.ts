/** Thrown by stub adapters. No external request has been made. */
export class AdapterNotImplementedError extends Error {
  readonly adapterName: string;

  constructor(adapterName: string) {
    super(
      `${adapterName} is a stub. It does not call an external API and does not read credentials. Implement it before using it in an import or sync job.`,
    );
    this.name = "AdapterNotImplementedError";
    this.adapterName = adapterName;
  }
}
