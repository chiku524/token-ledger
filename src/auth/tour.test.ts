import { describe, expect, it } from "vitest";
import { shouldShowConnectionTour } from "./tour";

describe("shouldShowConnectionTour", () => {
  it("shows the tour only for an admin who has not finished it", () => {
    expect(shouldShowConnectionTour({ role: "admin", completedAt: null, dismissedInBrowser: false })).toBe(true);
    expect(shouldShowConnectionTour({ role: "admin", completedAt: "2026-09-30T00:00:00.000Z", dismissedInBrowser: false })).toBe(false);
    expect(shouldShowConnectionTour({ role: "owner", completedAt: null, dismissedInBrowser: false })).toBe(false);
    expect(shouldShowConnectionTour({ role: "accountant", completedAt: null, dismissedInBrowser: false })).toBe(false);
    expect(shouldShowConnectionTour({ role: "viewer", completedAt: null, dismissedInBrowser: false })).toBe(false);
    expect(shouldShowConnectionTour({ role: "admin", completedAt: null, dismissedInBrowser: true })).toBe(false);
  });
});
