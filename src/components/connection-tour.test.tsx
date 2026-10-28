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
import type { GettingStartedPhase } from "@/data/getting-started";

const emptyProgress = { connections: [], observedBalanceCount: 0 };

function render(phase: GettingStartedPhase, accountType?: "individual" | "organization") {
  return renderToStaticMarkup(
    <ConnectionTourStep
      phase={phase}
      accountType={accountType}
      progress={emptyProgress}
      error={null}
      onContinue={() => undefined}
      onFinish={() => undefined}
    />,
  );
}

describe("ConnectionTourStep for an individual", () => {
  it("counts four steps from the first", () => {
    const html = render("connect", "individual");
    expect(html).toContain("1 of 4");
    expect(html).not.toContain("of 5");
    expect(html).not.toContain("of 6");
  });

  it("ends Reports on 4 of 4, and goes Holdings, Reports without Matching or entries", () => {
    expect(render("check", "individual")).toContain("2 of 4");
    const holdings = render("holdings", "individual");
    expect(holdings).toContain("3 of 4");
    expect(holdings).not.toMatch(/journal|posted/i);
    const reports = render("reports", "individual");
    expect(reports).toContain("4 of 4");
    expect(reports).not.toContain("Matching");
    expect(reports).not.toMatch(/journal|posted|trial balance/i);
  });

  it("keeps an organization at six", () => {
    expect(render("connect", "organization")).toContain("1 of 6");
    expect(render("journal", "organization")).toContain("5 of 6");
  });
});

describe("ConnectionTourStep", () => {
  it("opens on connect with getting started progress", () => {
    const html = render("connect");
    expect(html).toContain("Getting started");
    expect(html).toContain("Connect a venue to start");
    expect(html).toContain("1 of 6");
    expect(html).toContain("Open connection steps");
    expect(html).toContain("Skip guide");
  });

  it("explains Check before balances appear", () => {
    const html = render("check");
    expect(html).toContain("Check the connection");
    expect(html).toContain("Holdings stays empty");
  });

  it("covers Matching, Journal, and Reports on the day-to-day path", () => {
    expect(render("match")).toContain("Open Matching");
    expect(render("journal")).toContain("Open Journal");
    const reports = render("reports");
    expect(reports).toContain("Open Reports");
    expect(reports).toContain("Finish");
    expect(reports).toContain("Open the guide");
    expect(reports).toContain("6 of 6");
  });
});
