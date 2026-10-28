import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GainLossBars, GainLossLine } from "./charts";

const bars = [
  { id: "BTC", label: "BTC", value: 120.5, formatted: "Gain +USD 120.50 (+4.00%)", detail: "Value now USD 3,000.00" },
  { id: "ETH", label: "ETH", value: -40, formatted: "Loss -USD 40.00 (-2.00%)", detail: "Value now USD 1,960.00" },
];

const points = [
  { id: "2026-06-01", label: "2026-06-01", axisLabel: "1 Jun", value: 100, invested: 90, gain: 10, valueText: "USD 100.00", investedText: "USD 90.00", gainText: "Gain +USD 10.00" },
  { id: "2026-06-02", label: "2026-06-02", axisLabel: "2 Jun", value: 80, invested: 90, gain: -10, valueText: "USD 80.00", investedText: "USD 90.00", gainText: "Loss -USD 10.00" },
];

describe("gain / loss charts", () => {
  it("renders the bar chart with an accessible label", () => {
    const html = renderToString(<GainLossBars rows={bars} currency="USD" />);
    expect(html).toContain('role="img"');
    expect(html).toContain("Gain or loss by asset, in USD");
  });

  it("renders the line chart with an accessible label and a legend that names both lines", () => {
    const html = renderToString(<GainLossLine points={points} valueLabel="Value now" investedLabel="Put in" title="Value now and what you put in, over time" />);
    expect(html).toContain('role="img"');
    expect(html).toContain("Value now and what you put in, over time");
    expect(html).toContain("Value now");
    expect(html).toContain("Put in");
  });
});