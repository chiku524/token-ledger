# ADR: Account type (organization or individual)

Status: accepted. Phase 1 (this change) is the foundation only.

## Context

Token Ledger was built for institutions and accountants. We want a separate,
simpler experience for individuals who track their own holdings, chosen at
sign-up. An individual should not need a legal entity, a chart of companies,
approvals, or a combined-books view.

## Decision

An individual is still an **organization** in the data model: one organization,
one entity, one owner. Holdings, connections, balances, prices and valuation all
work unchanged. What differs is the **account type**, which decides the
experience and the sign-up questions.

- `organizations.account_type` is a Postgres enum `organization_account_type`
  with values `organization` and `individual`. It is `NOT NULL DEFAULT
  'organization'`, so every existing row stays an organization and nothing is
  backfilled or rewritten. The values live in `src/data/account-type.ts`, shared
  by the schema, server code and sign-up form.
- The type flows through `Books.organization.accountType`, `registerOrganization`
  and `SessionUser.accountType`. A session defaults to `organization`, including
  demo sessions.
- Sign-up asks "Individual or Organization" first. An organization sees exactly
  the form it did before. An individual skips the company details:
  - the organization and entity are both named `<Name> (Personal)`,
  - country defaults to `US` (two-letter code, editable),
  - currency defaults to `USD` and may be MYR, SGD or USD,
  - the reporting standard is the existing default, `IFRS`, and is not shown.
- Both types still land on `/dashboard/settings` after sign-up in this phase.

## Product decisions

- An individual can later **convert to an organization**.
- An individual can later **invite a spouse or an accountant**.
- Currencies stay MYR, SGD and USD for now.
- Free for now, while organizations are free.
- Tax output by country is planned as a **paid** feature.
- The individual area will live at `/me`.

## Phases

1. **Account type foundation** (this ADR): column, session, sign-up choice. No
   visible change for organizations.
2. Simplified individual sign-up refinements.
3. The `/me` shell (Overview, Holdings) and route guards that keep each type out
   of the other's pages.
4. Activity, Connections and export pages for individuals.
5. Cost basis, realized and unrealized gains, and a country-based tax report
   (the paid feature). The app has no cost-basis logic today, so this is the
   largest piece.
6. An individual plan, conversion to an organization, invites for a spouse or an
   accountant, then landing page and docs.

## Consequences

- Existing organizations are unaffected; the migration is a catalog change with a
  constant default, with no table rewrite.
- Adding a third type later means `ALTER TYPE ... ADD VALUE` and one more entry in
  `ORGANIZATION_ACCOUNT_TYPES`.
- Until the guards ship (phase 3), the type does not restrict any page.
