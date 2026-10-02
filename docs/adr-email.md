# ADR: Transactional email

Status: accepted. Epic #71, issues #72/#73 (provider), #28/#29/#30 (flows).

## Context

Invites were shown on screen and never sent. There was no password reset, so a
locked-out user was stuck, and no way to confirm an email address. This ADR
records the provider, the fallback, and the token flows.

## Decision

### Provider

A small port in `src/email/provider.ts` with one live implementation, **Resend**,
and a no-op fallback. `sendEmail` retries a **retryable** failure (5xx or 429) up
to three times with backoff, and never throws: it returns
`{ sent: false, reason }` so a caller can fall back. 4xx failures are not retried.

Email is **optional**. When `RESEND_API_KEY` or `EMAIL_FROM` is unset the no-op
provider is used, nothing is sent, and:

- an invite falls back to the on-screen link (as before), and
- the reset and verify flows still create the token but report that nothing was
  sent, so a demo or CI never reaches the network.

Message bodies are built by pure functions in `src/email/messages.ts`. Tokens and
message bodies are never logged.

### Links

`absoluteLink` builds `APP_URL` when set, otherwise the request host, so a
preview links to itself and production uses the real domain.

### Flows

- **Invite (#28).** `inviteUserAction` creates the user and token, sends the
  invite, and audits whether it was emailed. The link is still shown once.
- **Password reset (#29).** `password_resets` stores only a token hash. The
  request action always returns a generic "if that email has an account…" so it
  does not disclose membership. A reset sets the new hash, **deletes the user's
  sessions**, and deletes the token. `/reset-password` handles both request and
  reset. The reset is audited.
- **Email verification (#30).** `users.email_verified_at` plus
  `email_verifications`. A link is sent on sign-up; best-effort, so a failure does
  not block sign-up. An unverified user is not blocked — every page works — but a
  banner prompts to confirm. Confirming is audited.

### Tokens

Reset and verification tokens reuse the invite scheme: a random token, only its
`sealToken` hash stored, single-use, with an expiry (reset 60 minutes, verify 7
days). Creating a new token deletes the user's previous one.

## Consequences

- A locked-out user can reset their password and is signed out everywhere on
  reset.
- Invites can be emailed; without a provider they still work via the on-screen
  link.
- Sign-up sends a confirmation link; the account is usable before confirming.
- Nothing is sent in dev/CI unless a provider is configured.

## Not done

- An unverified user is only prompted, not restricted; a stricter policy (for
  example, blocking export until verified) is a product decision.
- No email-change flow; changing an address re-verifies is not implemented.
- Delivery is best-effort with three retries; there is no durable outbox, so a
  long provider outage drops a send. A queue would be the follow-up.
