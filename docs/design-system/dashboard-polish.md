# Dashboard polish

The dashboard looked generic because pages did not follow the design system, not because the system was weak. This pass keeps the palette, fonts and lime/cobalt identity and makes the existing pieces hold everywhere.

## What changed

**Stylesheet bugs (`src/app/globals.css`)**
- Global `h1`–`h4` and `a.underline` rules were outside any cascade layer, so they beat Tailwind utilities. Headings were always bold and a colour class on an underlined link did nothing. Both rules now live in `@layer base`; headings default to weight 600.
- `--color-accent` was defined twice (cobalt in `@theme`, neutral tint from shadcn). Menu and select highlights resolved to cobalt. The cobalt duplicate is removed; links use `--color-link`, the brand uses `--color-brand`.
- New `.label-caps`, `.page-stack` and `.section-stack` classes replace one-off tracking and spacing values.

**Shared pieces**
- `ChartFrame` is built on `Card`, shows an empty message when there is no data, and lazy charts show a skeleton instead of nothing.
- `StatCard` takes a `hint`; Operations uses it instead of its own `StatusCard`.
- `ConnectionsTable` replaces two copies of the same table (Holdings, Settings).
- `formatUsdc` in `src/data/present.ts` replaces three copies of `usdc()`.
- `ALWAYS_VISIBLE_SECTIONS` in `src/data/onboarding-sections.ts` is the one labelled list of sections that cannot be hidden.

**Navigation**
- The sidebar is grouped (Books, Payments, Reporting, Workspace, Account). A group disappears when every link in it is hidden for the role. Guide moved into Workspace.

**Bugs fixed on the way**
- Billing, Treasury and Payables checked section access after loading their data. They now check first.
- Amount column headers in Payables and Billing are right-aligned over their numbers.

## Left for later, on purpose
- `BillingAction` / `TreasuryAction` share a busy-button pattern but drive on-chain signing through a browser wallet. They were not merged because that flow needs a wallet to verify.
- `MethodTabs` in the connect modal still uses buttons rather than `ui/tabs`.
- Built-in `TableCard` / `EmptyState` / `ReadOnlyNote` margins are unchanged. Removing them needs a page-by-page move to `.page-stack`.
- Unbounded tables (Holdings, Users, Approvals, Payables, Operations) are not paginated; that needs data-layer paging.
- Section headings that carry an `id` for `aria-labelledby` (Guide, ownership choice) keep their own `h2`.
