import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatCard } from "./stat-card";

describe("StatCard", () => {
  it("shows the hint under the value when given", () => {
    const html = renderToStaticMarkup(<StatCard label="Failed runs" value={2} hint="Execution attempts that errored" />);
    expect(html).toContain("Failed runs");
    expect(html).toContain("Execution attempts that errored");
  });

  it("omits the hint row when there is none", () => {
    const html = renderToStaticMarkup(<StatCard label="Companies" value={3} />);
    expect(html).not.toContain("text-xs text-muted-foreground");
  });
});
