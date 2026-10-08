/** Thrown when a provider is configured but its adapter has no live path. */
export class ProviderNotImplementedError extends Error {
  readonly providerKey: string;

  constructor(providerKey: string) {
    super(`${providerKey} is not implemented. Configure a supported AI_PROVIDER before using the assistant.`);
    this.name = "ProviderNotImplementedError";
    this.providerKey = providerKey;
  }
}

/**
 * Thrown when a provider call fails. Carries the HTTP status and the provider's
 * own error text (already redacted of anything secret by the adapter) so the
 * runtime can surface a useful message without leaking a key.
 */
export class ProviderError extends Error {
  readonly providerKey: string;
  readonly status?: number;

  constructor(providerKey: string, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.providerKey = providerKey;
    this.status = status;
  }
}

/** Thrown when a provider response does not match the neutral shapes. */
export class ProviderResponseError extends Error {
  readonly providerKey: string;

  constructor(providerKey: string, detail: string) {
    super(`${providerKey} returned a response the assistant could not read: ${detail}`);
    this.name = "ProviderResponseError";
    this.providerKey = providerKey;
  }
}
