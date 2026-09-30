import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionGuide } from "./connection-guide";

describe("ConnectionGuide", () => {
  it("explains the read path, the three modes, and the lifecycle", () => {
    const html = renderToStaticMarkup(<ConnectionGuide csrf="csrf" canRestartTour={false} />);
    expect(html).toContain("Where a connection sits");
    expect(html).toContain("Watch-only wallet");
    expect(html).toContain("Exchange, read-only");
    expect(html).toContain("Custodian, read-only");
    expect(html).toContain("Observed balance");
    expect(html).toContain("A check never posts one.");
    expect(html).toContain("Waiting");
    expect(html).toContain("Disconnected");
    expect(html).not.toContain("Take the tour");
  });

  it("offers the tour again to an admin who has already finished it", () => {
    const html = renderToStaticMarkup(<ConnectionGuide csrf="csrf" canRestartTour />);
    expect(html).toContain("Take the tour");
  });
});
