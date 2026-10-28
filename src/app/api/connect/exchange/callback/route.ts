import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createVenueConnector, venueDefinition } from "@/adapters";
import { withNotice } from "@/app/dashboard/form-state";
import { getSession } from "@/auth/current";
import {
  exchangeAuthorizationCode,
  exchangeCallbackUrl,
  OAUTH_STATE_COOKIE,
  originFromHeaders,
  readOauthClient,
  readOauthState,
} from "@/auth/exchange-oauth";
import { canAccessEntity } from "@/auth/roles";
import type { OrganizationAccountType } from "@/data/account-type";
import { canWriteBooks } from "@/data/authorized-books";
import { connectionFromForm } from "@/data/connections";
import { loadBooks } from "@/data/load-books";
import { pathFor } from "@/data/me-paths";
import { insertConnection } from "@/db/write";
import { readAuthSecret } from "@/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Coinbase and Bybit send the browser here after the user allows read-only access. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = originFromHeaders(request.headers) ?? url.origin;
  const code = url.searchParams.get("code");
  const nonce = url.searchParams.get("state");
  // The account's own area, so the redirect back lands with no further hop. Unknown when signed out.
  const session = await getSession();
  const accountType = session?.accountType;

  if (url.searchParams.get("error") || !code || !nonce) {
    return done(origin, "error", "The exchange did not grant access.", accountType);
  }

  let secret: string;
  try {
    secret = readAuthSecret();
  } catch {
    return done(origin, "error", "Exchange connection is not configured.", accountType);
  }

  const jar = await cookies();
  const state = readOauthState(jar.get(OAUTH_STATE_COOKIE)?.value ?? "", secret);
  if (!state || state.nonce !== nonce) return done(origin, "error", "This exchange connection expired. Start it again.", accountType);

  if (!session || session.demo || session.id !== state.sessionId || session.organizationId !== state.organizationId) {
    return done(origin, "error", "Sign in again before connecting an exchange.", accountType);
  }
  if (!canWriteBooks(session) || !canAccessEntity(session, state.entityId)) {
    return done(origin, "error", "This account cannot save a connection.", accountType);
  }

  const client = readOauthClient(state.venue);
  const venue = venueDefinition(state.venue);
  if (!client || !venue) return done(origin, "error", "That exchange connection is not configured.", accountType);

  try {
    const credential = await exchangeAuthorizationCode({
      venue: state.venue,
      client,
      code,
      redirectUri: exchangeCallbackUrl(origin),
    });
    await createVenueConnector(state.venue, credential).verify();
    const books = await loadBooks(session.organizationId);
    await insertConnection(
      books,
      connectionFromForm({
        entityId: state.entityId,
        mode: "exchange_read",
        name: venue.label,
        chain: null,
        role: null,
        identifier: "main",
        exchangeVenue: state.venue,
      }),
      `${session.name} <${session.email}>`,
      credential,
    );
  } catch {
    return done(origin, "error", "The exchange connection failed. Access stays read-only, and nothing was stored.", accountType);
  }

  revalidatePath("/dashboard", "layout");
  return done(origin, "saved", `${venue.label} connected. Access is read-only and cannot trade or withdraw.`, accountType);
}

function done(origin: string, key: "saved" | "error", message: string, accountType?: OrganizationAccountType) {
  const response = NextResponse.redirect(new URL(withNotice(pathFor(accountType, "/dashboard/settings"), key, message), origin));
  response.cookies.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
