import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NavMain } from "./nav-main";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/ledger" }));

function render(props: Partial<Parameters<typeof NavMain>[0]> = {}): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SidebarProvider>
        <NavMain showUsers={false} showOnboarding={false} role="accountant" {...props} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

function labels(html: string): string[] {
  return [...html.matchAll(/<span class="relative">([^<]*)<\/span>/g)].map((match) => match[1]);
}

function groupNames(html: string): string[] {
  return [...html.matchAll(/data-slot="sidebar-group-label"[^>]*><span>([^<]*)<\/span>/g)].map((match) => match[1]);
}

describe("NavMain", () => {
  it("groups the sections and keeps every link", () => {
    const html = render();
    expect(groupNames(html)).toEqual(["Books", "Payments", "Reporting", "Workspace", "Account"]);
    expect(labels(html)).toEqual([
      "Overview",
      "Companies",
      "Holdings",
      "Journal",
      "Approvals",
      "Matching",
      "Billing",
      "Treasury",
      "Payables",
      "Reports",
      "Combined",
      "Operations",
      "History",
      "Guide",
      "Settings",
    ]);
  });

  it("marks only the current section", () => {
    const html = render();
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/);
    expect(current?.[0]).toContain('href="/dashboard/ledger"');
  });

  it("adds Users and Onboarding to the account group when allowed", () => {
    expect(labels(render({ showUsers: true, showOnboarding: true })).slice(-3)).toEqual(["Users", "Onboarding", "Settings"]);
  });

  it("hides sections an operator turned off for the onboarding role", () => {
    const html = render({ role: "onboarding", hiddenTabs: ["/dashboard/billing", "/dashboard/treasury", "/dashboard/payables"] });
    expect(labels(html)).not.toContain("Billing");
    expect(labels(html)).not.toContain("Treasury");
    expect(labels(html)).not.toContain("Payables");
    expect(groupNames(html)).not.toContain("Payments");
    expect(labels(html)).toContain("Overview");
    expect(labels(html)).toContain("Settings");
  });

  it("does not hide anything from other roles", () => {
    const html = render({ role: "accountant", hiddenTabs: ["/dashboard/billing"] });
    expect(labels(html)).toContain("Billing");
  });
});
