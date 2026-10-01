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

/** Where a connection form may send the user after it saves. Anything else stays on Settings. */
export function connectionReturnPath(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return (CONNECTION_RETURNS as readonly string[]).includes(path) ? path : "/dashboard/settings";
}
