import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { isActiveLink, NavMain } from "./nav-main";

vi.mock("next/navigation", () => ({ usePathname: () => "/me/activity" }));

function render(props: Partial<Parameters<typeof NavMain>[0]> = {}): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <SidebarProvider>
        <NavMain showUsers={false} showOnboarding={false} showPlatform={false} role="owner" {...props} />
      </SidebarProvider>
    </TooltipProvider>,
  );
}

const hrefs = (html: string): string[] => [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((match) => match[1]);

describe("NavMain links for an individual", () => {
  it("point into /me, under the names the person sees", () => {
    const links = hrefs(render({ accountType: "individual", showUsers: true }));
    expect(links).toEqual(["/me", "/me/holdings", "/me/activity", "/me/reports", "/me/guide", "/me/history", "/me/people", "/me/settings"]);
    expect(links.some((href) => href.startsWith("/dashboard"))).toBe(false);
  });

  it("mark the page they are on", () => {
    const html = render({ accountType: "individual" });
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>|<a [^>]*data-active="true"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/me/activity"');
  });
});

describe("NavMain links for an organization", () => {
  it("stay on /dashboard", () => {
    const links = hrefs(render({ accountType: "organization", role: "accountant" }));
    expect(links).toContain("/dashboard/ledger");
    expect(links.some((href) => href.startsWith("/me"))).toBe(false);
  });
});

describe("isActiveLink", () => {
  it("treats the /me and /dashboard addresses of a page as the same page", () => {
    expect(isActiveLink("/me/activity", "/me/activity")).toBe(true);
    expect(isActiveLink("/me/activity", "/dashboard/ledger")).toBe(true);
    expect(isActiveLink("/dashboard/ledger", "/me/activity")).toBe(true);
    expect(isActiveLink("/me/activity/JE-1", "/me/activity")).toBe(true);
    expect(isActiveLink("/me/holdings", "/me/activity")).toBe(false);
  });

  it("matches the overview only on the overview", () => {
    expect(isActiveLink("/me", "/me")).toBe(true);
    expect(isActiveLink("/me", "/dashboard")).toBe(true);
    expect(isActiveLink("/me/reports", "/me")).toBe(false);
    expect(isActiveLink("/dashboard/reports", "/dashboard")).toBe(false);
  });
});
