import { NextResponse, type NextRequest } from "next/server";
import { cookieSecure, DEMO_COOKIE, SESSION_COOKIE, sessionCookieOptions } from "@/auth/cookies";
import { CSRF_COOKIE, newCsrfToken, safeNextPath } from "@/auth/csrf";
import { demoSessionFromCookie, demoSignInAllowed } from "@/auth/demo";

const CSRF_HEADER = "x-token-ledger-csrf";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const existingCsrf = request.cookies.get(CSRF_COOKIE)?.value;
  const csrf = existingCsrf ?? newCsrfToken();
  requestHeaders.set(CSRF_HEADER, csrf);

  const response = dashboardAllowed(request)
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.redirect(signInUrl(request));

  if (!existingCsrf) {
    response.cookies.set(CSRF_COOKIE, csrf, sessionCookieOptions(cookieSecure()));
  }
  return response;
}

function dashboardAllowed(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname !== "/dashboard" && !pathname.startsWith("/dashboard/")) return true;
  if (demoSessionFromCookie(request.cookies.get(DEMO_COOKIE)?.value)) return true;
  if (demoSignInAllowed()) return false;
  return Boolean(request.cookies.get(SESSION_COOKIE)?.value);
}

function signInUrl(request: NextRequest): URL {
  const url = request.nextUrl.clone();
  const next = safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
  url.pathname = "/sign-in";
  url.search = `?next=${encodeURIComponent(next)}`;
  return url;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
