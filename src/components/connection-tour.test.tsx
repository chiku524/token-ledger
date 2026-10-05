import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => "/dashboard",
}));

vi.mock("@/app/dashboard/tour-actions", () => ({
  completeConnectionTourAction: async () => undefined,
}));

import { ConnectionTourStep } from "./connection-tour";

const emptyProgress = { connections: [], observedBalanceCount: 0 };

function render(phase: "connect" | "check" | "holdings" | "next") {
  return renderToStaticMarkup(
    <ConnectionTourStep
      phase={phase}
      progress={emptyProgress}
      error={null}
      onContinue={() => undefined}
      onFinish={() => undefined}
    />,
  );
}

describe("ConnectionTourStep", () => {
  it("opens on connect with getting started progress", () => {
    const html = render("connect");
    expect(html).toContain("Getting started");
    expect(html).toContain("Connect a venue to start");
    expect(html).toContain("1 of 4");
    expect(html).toContain("Open connection steps");
    expect(html).toContain("Skip guide");
  });

  it("explains Check before balances appear", () => {
    const html = render("check");
    expect(html).toContain("Check the connection");
    expect(html).toContain("Holdings stays empty");
  });

  it("offers Matching on the last step", () => {
    const html = render("next");
    expect(html).toContain("Finish");
    expect(html).toContain("Open Matching");
    expect(html).toContain("Open the guide");
  });
});
