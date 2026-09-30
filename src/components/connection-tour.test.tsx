import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => "/dashboard",
}));

vi.mock("@/app/dashboard/tour-actions", () => ({
  completeConnectionTourAction: async () => undefined,
}));

import { ConnectionTour } from "./connection-tour";

describe("ConnectionTour", () => {
  it("opens on the read-only explanation", () => {
    const html = renderToStaticMarkup(<ConnectionTour csrf="csrf" />);
    expect(html).toContain("Connection tour");
    expect(html).toContain("A connection only reads");
    expect(html).toContain("1 of 5");
    expect(html).toContain("does not store an API key");
  });
});
