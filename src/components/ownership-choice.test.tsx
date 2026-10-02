import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnershipChoice } from "./ownership-choice";

describe("OwnershipChoice", () => {
  it("offers connect-and-sign and watch-only, and leaves WalletConnect off when unconfigured", () => {
    const html = renderToStaticMarkup(<OwnershipChoice walletConnectReady={false} />);
    expect(html).toContain("Connect and sign");
    expect(html).toContain("Watch an address");
    expect(html).toContain("does not allow a transfer");
    expect(html).toContain("No signature is required");
    expect(html).toContain("WalletConnect is off");
  });

  it("says WalletConnect is available when a project id is configured", () => {
    const html = renderToStaticMarkup(<OwnershipChoice walletConnectReady />);
    expect(html).toContain("WalletConnect is available");
  });
});
