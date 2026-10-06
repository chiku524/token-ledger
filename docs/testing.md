# Testing

All tests run with [Vitest](https://vitest.dev) in the Node environment. They need no database, no network, and no browser.

```bash
pnpm test                                        # the whole suite, as CI runs it
pnpm vitest run src/app/dashboard/actions.test.ts # one file
pnpm vitest run -t "postJournalAction"            # tests whose name matches
pnpm vitest                                       # watch mode
```

CI runs `pnpm test` in the `check` job (`.github/workflows/ci.yml`), after lint and typecheck and before the build.

## What is covered where

| Area | Tests |
|---|---|
| Ledger, data, adapters, auth helpers | `*.test.ts` next to each module |
| Server actions | `src/app/**/actions.test.ts`, `src/app/dashboard/*-actions.test.ts` |
| Dashboard pages and layout | `src/app/dashboard/pages.test.tsx` |
| `fail` / `finish` / `save` / `safeMessage` | `src/app/dashboard/form-state.test.ts` |
| Every server action has a test | `src/app/server-actions.test.ts` |

## Server action tests

An action test calls the exported action with a `FormData`, the same way a form submit does, and reads where it redirects.

Auth runs for real: `assertCsrf`, `getSession`, `requirePermission`, the role matrix in `src/auth/roles.ts`, entity scope, and `canWriteBooks`. Only the edges are mocked:

- `next/headers`: an in-memory cookie jar plus `host` and `origin` headers.
- `next/navigation`: `redirect` throws a `RedirectSignal` that the test reads.
- `next/cache`: `revalidatePath` is a spy.
- Database and IO modules (`@/db/*`, `@/email/links`, exchange and custodian `verify` calls): spies with safe defaults. `loadBooks` returns the example books.

Sessions are built the way production builds them:

- **Live user:** `signInLive(role, overrides)` sets `DATABASE_URL`, a session cookie, and the user the mocked session lookup returns.
- **Read-only:** `signInDemo(role, entityScope)` clears `DATABASE_URL` and signs a real demo cookie. A demo session with no database is the read-only sample, so every write action must refuse it.

Each mutating action is checked for:

1. success: the saved notice, the dashboard revalidated, and the write called with the actor
2. a role without the permission
3. read-only (a demo session with no database)
4. a stale or missing CSRF token, a cross-site or missing `Origin`, and a signed-out visitor
5. entity scope, where the action checks it
6. validation messages
7. error branches through `save`: a known error shows its message, a unique violation or missing table is mapped, and anything else is hidden and logged

The table in `actions.test.ts` (`specs`) runs the shared checks for all 17 books actions. Add a row for a new books action.

Wallet ownership and binding tests sign challenges with real keys (secp256k1 through viem, ed25519 through `@noble/curves`), so signature checks are not mocked.

### Helpers

`src/test/server-harness.ts` holds the shared pieces:

- the mock factories, wired with `vi.mock("next/headers", async () => (await import("@/test/server-harness")).headersMock)`
- `resetRequest`, `signInLive`, `signInDemo`, `form`
- `redirectOf`, `expectSaved`, `expectError`
- fixture ids from the example books (`ORG`, `MY`, `SG`)

Call `resetRequest()` in `beforeEach`. Call `vi.resetAllMocks()` and `vi.unstubAllEnvs()` in `afterEach`; `resetAllMocks` restores each spy's default.

## Page tests

Dashboard pages are async server components. A test awaits the page function, then renders the result with React's `prerenderToNodeStream`, which also renders nested async components. It asserts on the text. This needs no jsdom and no Testing Library.

Pages read data through the real `loadAuthorizedBooks`, so role gating and entity scope are real. `saved` notices are toasts and never appear in static markup; `error` notices render as an alert. Radix dropdown and dialog content renders only when open, so it is not in the markup either.

## Adding a server action

`src/app/server-actions.test.ts` finds every `"use server"` file and fails when its sibling `.test.ts` is missing or never calls one of its exported actions. Write the test in the sibling file. Cover at least success, a denied role, and read-only.

## Known bugs pinned with `it.fails`

A test marked `it.fails` describes the correct behavior for a known bug. It passes while the bug exists. When the bug is fixed, it starts failing; change it to `it` in the same change as the fix.
