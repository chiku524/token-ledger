import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartFrame } from "./frame";

describe("ChartFrame", () => {
  it("renders the chart and a screen-reader table when there is data", () => {
    const html = renderToStaticMarkup(
      <ChartFrame title="Assets" rows={[{ label: "ETH", detail: "MYR 10.00" }]}>
        <div>chart-body</div>
      </ChartFrame>,
    );
    expect(html).toContain("chart-body");
    expect(html).toContain("MYR 10.00");
    expect(html).not.toContain("Nothing to chart");
  });

  it("explains an empty chart instead of drawing nothing", () => {
    const html = renderToStaticMarkup(
      <ChartFrame title="Assets" rows={[]}>
        <div>chart-body</div>
      </ChartFrame>,
    );
    expect(html).toContain("Nothing to chart for these dates.");
    expect(html).not.toContain("chart-body");
    expect(html).not.toContain("<table");
  });

  it("uses a custom empty message", () => {
    const html = renderToStaticMarkup(
      <ChartFrame title="Assets" rows={[]} empty="No holdings yet.">
        <div>chart-body</div>
      </ChartFrame>,
    );
    expect(html).toContain("No holdings yet.");
  });
});
