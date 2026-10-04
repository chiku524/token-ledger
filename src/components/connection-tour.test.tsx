import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
  usePathname: () => "/dashboard",
}));

vi.mock("@/app/dashboard/tour-actions", () => ({
  completeConnectionTourAction: async () => undefined,
}));

import { Dialog } from "@/components/ui/dialog";
import { ConnectionTourStep } from "./connection-tour";

function render(step: number) {
  return renderToStaticMarkup(
    <Dialog open>
      <ConnectionTourStep step={step} error={null} onBack={() => undefined} onNext={() => undefined} onFinish={() => undefined} />
    </Dialog>,
  );
}

describe("ConnectionTourStep", () => {
  it("opens on the read-only explanation", () => {
    const html = render(0);
    expect(html).toContain("Connection tour");
    expect(html).toContain("A connection only reads");
    expect(html).toContain("1 of 5");
    expect(html).toContain("Permissions stay read-only");
    expect(html).not.toContain("Back");
  });

  it("offers the guide on the last step", () => {
    const html = render(4);
    expect(html).toContain("Finish");
    expect(html).toContain("Open the guide");
  });
});
