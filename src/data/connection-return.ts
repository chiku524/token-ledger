import { isSectionAllowed } from "./account-sections";
import type { OrganizationAccountType } from "./account-type";
import { dashboardPath } from "./me-paths";

const CONNECTION_RETURNS = [
  "/dashboard/settings",
  "/dashboard/sources",
  "/dashboard/operations",
  "/dashboard/setup",
  "/dashboard/setup?step=wallet",
  "/dashboard/setup?step=exchange",
  "/dashboard/setup?step=custodian",
  "/dashboard/setup?step=done",
] as const;

/** Holdings market-value currency toggle after a price refresh. */
const HOLDINGS_CURRENCY_RETURN = /^\/dashboard\/sources\?currency=(USD|SGD|MYR)$/;

/**
 * Where a connection form may send the user after it saves. Anything else stays on
 * Settings. An individual has no Operations section, so it is never a return path
 * for one; they land on Settings instead.
 */
export function connectionReturnPath(value: unknown, accountType?: OrganizationAccountType): string {
  // A form may name the page by either address. The answer is the dashboard address, which the
  // actions revalidate; an individual's request for it is sent on to /me by the account guard.
  const path = typeof value === "string" ? dashboardPath(value) : "";
  return (CONNECTION_RETURNS as readonly string[]).includes(path)
    ? isSectionAllowed(accountType, path)
      ? path
      : "/dashboard/settings"
    : HOLDINGS_CURRENCY_RETURN.test(path)
      ? path
      : "/dashboard/settings";
}
