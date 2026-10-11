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

/** Where a connection form may send the user after it saves. Anything else stays on Settings. */
export function connectionReturnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  if ((CONNECTION_RETURNS as readonly string[]).includes(path)) return path;
  if (HOLDINGS_CURRENCY_RETURN.test(path)) return path;
  return "/dashboard/settings";
}
