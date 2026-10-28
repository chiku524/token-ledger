import { isSectionAllowed } from "./account-sections";
import type { OrganizationAccountType } from "./account-type";

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
  const path = typeof value === "string" ? value : "";
  if ((CONNECTION_RETURNS as readonly string[]).includes(path)) return isSectionAllowed(accountType, path) ? path : "/dashboard/settings";
  if (HOLDINGS_CURRENCY_RETURN.test(path)) return path;
  return "/dashboard/settings";
}
