"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { assertCsrf, AuthError, requirePermission } from "@/auth/current";
import { cookieSecure, sessionCookieOptions } from "@/auth/cookies";
import {
  buildExchangeAuthorizeUrl,
  exchangeCallbackUrl,
  isOauthExchange,
  newOauthNonce,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  originFromHeaders,
  readOauthClient,
  signOauthState,
} from "@/auth/exchange-oauth";
import { canAccessEntity } from "@/auth/roles";
import { canWriteBooks } from "@/data/authorized-books";
import { connectionReturnPath } from "@/data/connection-return";
import { venueDefinition } from "@/adapters";
import { readAuthSecret } from "@/env";
import { fail } from "./form-state";

const READ_ONLY = "Connect a database to save changes. This demo and the sample on screen are read-only.";

/** Send the browser to the exchange Allow-access screen. The code comes back to the callback. */
export async function startExchangeOauthAction(formData: FormData) {
  const path = connectionReturnPath(formData.get("next"));
  try {
    await assertCsrf(formData);
    const session = await requirePermission("source.write");
    if (!canWriteBooks(session)) fail(path, READ_ONLY);
    const venueName = String(formData.get("venue") ?? "");
    if (!isOauthExchange(venueName)) fail(path, "That exchange does not connect with OAuth.");
    const venue = venueDefinition(venueName);
    if (!venue) fail(path, "Choose an exchange.");
    const client = readOauthClient(venueName);
    if (!client) fail(path, `${venue.label} OAuth is not configured yet. Use a read-only API key instead.`);
    const entityId = String(formData.get("entityId") ?? "");
    if (!canAccessEntity(session, entityId)) fail(path, "Choose a company in this organization.");
    const origin = originFromHeaders(await headers());
    if (!origin) fail(path, "Could not start the exchange connection.");

    const nonce = newOauthNonce();
    const token = signOauthState(
      {
        nonce,
        sessionId: session.id,
        organizationId: session.organizationId,
        entityId,
        venue: venueName,
        exp: Date.now() + OAUTH_STATE_TTL_MS,
      },
      readAuthSecret(),
    );
    const jar = await cookies();
    jar.set(OAUTH_STATE_COOKIE, token, { ...sessionCookieOptions(cookieSecure()), maxAge: OAUTH_STATE_TTL_MS / 1000 });
    redirect(buildExchangeAuthorizeUrl({
      venue: venueName,
      clientId: client.clientId,
      redirectUri: exchangeCallbackUrl(origin),
      state: nonce,
    }));
  } catch (error) {
    if (error instanceof AuthError) fail(path, error.message);
    throw error;
  }
}
