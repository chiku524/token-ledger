export const SESSION_COOKIE = "tl_session";
export const DEMO_COOKIE = "tl_demo";
export const CONNECTION_TOUR_COOKIE = "tl_connection_tour";
/** When set to "1", the dashboard shows the example books instead of the database. */
export const DEMO_DATA_COOKIE = "tl_demo_data";

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

/** A week in the browser, so a demo run survives a reload and a restart. */
export function demoDataCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export function cookieSecure(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}
