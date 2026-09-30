export const SESSION_COOKIE = "tl_session";
export const DEMO_COOKIE = "tl_demo";
export const CONNECTION_TOUR_COOKIE = "tl_connection_tour";

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export function cookieSecure(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}
