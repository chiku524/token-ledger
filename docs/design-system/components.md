# Component inventory

See `README.md` for the rules and `phases.md` for the rollout. Status: **built in
Phase 2, not yet adopted by pages** unless noted. Pages move over in Phases 3 to 5.

## Primitives (`src/components/ui/`)

shadcn (`radix-nova`), branded through the tokens in `globals.css`.

| Component | Notes |
|---|---|
| `Button` | Variants `default` (lime), `brand` (cobalt), `secondary`, `outline`, `ghost`, `link`, `destructive`. Default height 36px, `lg` 40px. |
| `Badge` | `live`, `example`, `success`, `warning`, `danger`, `neutral` (plus the shadcn defaults). |
| `Alert` | `default`, `destructive`, `success`, `warning`. |
| `Card` | Bordered (`border-border`), no ring. |
| `Table` | Server-safe. Uppercase tracked header, lime-tinted row hover (the old `.ledger-table` look). |
| `Input`, `Textarea` | 36px, `bg-background`. |
| `NativeSelect` (+ `NativeSelectOption`, `NativeSelectOptGroup`) | Use this for forms posted to server actions. Radix `Select` is for client-driven UI only. |
| `Label`, `Separator`, `Skeleton`, `Tabs`, `Toggle`, `ToggleGroup` | shadcn defaults |
| `Dialog`, `Sheet`, `DropdownMenu`, `Tooltip` | shadcn defaults. Wrap the app in `TooltipProvider` when the first tooltip is used. |

## App composites (`src/components/app/`)

| Component | Replaces |
|---|---|
| `StatusBadge` (+ `connectionStatusTone`) | Per-page pine/seal status ternaries |
| `EmptyState` | `panel px-4 py-6 text-sm text-ink-soft` |
| `SectionHeader` | `text-lg font-semibold tracking-tight` h2 |
| `TableCard` | `mt-4 overflow-x-auto panel` |
| `Amount` | `.num` (add `text-right` on the cell for column alignment) |
| `Field` | `.field` |
| `StatCard` | Overview stat tiles; numbers count up (`NumberTicker`) and stagger in. Place inside a `Stagger`. |
| `NumberHead`, `NumberCell` | `.num` table columns. `NumberCell align="left"` for dates and addresses (pair it with a plain `TableHead`). |
| `EmptyRow` | Centred muted message row for a table with no rows. Pass `colSpan` for the column count. Use `EmptyState` when the whole table is absent. |
| `FormCard` | `grid gap-3 panel p-4` form with a title and description (headings `h2` or `h3`) |
| `SegmentedLinks` | Company switcher in Reports and Combined |

`Flash` (`src/components/flash.tsx`) is rebuilt on `Alert` and **is live** on every
page that already used it.

## App shell (Phase 3, live)

| File | Role |
|---|---|
| `dashboard-shell.tsx` | Desktop sidebar, mobile top bar, unverified-email `Alert` |
| `dashboard-nav.tsx` | lucide icons, one shared `layoutId` pill for the active link |
| `mobile-nav.tsx` | `Sheet` menu below `md`, closes on navigation |
| `user-menu.tsx` | `DropdownMenu` with email, scope, and sign out |
| `theme-toggle.tsx` | Icon `Button`; same `tl-theme` key and no-flash script |
| `app/dashboard/template.tsx` | `PageTransition` fade on every dashboard navigation |
| `app/dashboard/loading.tsx` | `Skeleton` placeholder |

## Brand (`src/components/logo.tsx`)

`LogoMark` and `Logo`, variants `brand` (default), `onLight`, `onLime`, `mono`. Colours
come from tokens (`brand`, `primary`, `cloud`, `night`), not hex. `wordmark.tsx` re-exports
them under the old names (`BrandMark`, `Wordmark`) and is **live** in the shell and
public pages; it goes away in the cleanup phase. `src/app/icon.svg` still uses hex (a
favicon file cannot read CSS variables) and already matches the brand mark.

## Motion (`src/components/motion/`)

`MotionProvider` (live in the root layout), `FadeIn`, `PageTransition`, `Stagger` /
`StaggerItem`, `NumberTicker`, `Presence`. Rules in `motion.md`. `FadeIn`,
`PageTransition` and `Stagger` are CSS-driven server components; only
`NumberTicker` and `Presence` are `"use client"` motion leaves.

## Tokens added for the system

`brand`, `brand-foreground`, `link`, `success`, `danger`, `warning` (dark values are
lighter so they stay readable on Night), and the theme-independent `cloud` and `night`.
Use `danger` / `success` for text; the legacy `seal` / `pine` are too dim on Night.

## Cleanup notes

- The legacy classes (`.btn`, `.panel`, `.field`, `.ledger-table`, `.num`, `.kicker`, `.skip-link`) and the `wordmark.tsx` shim are gone. Use the components above; `eyebrow` is the small uppercase label.
- The global lime focus outline now lives in `@layer base`, so shadcn's own ring (`outline-none` plus `ring`) wins and controls no longer show two rings.
- `@media print` forces the light palette, hides the sidebar, forms and buttons, and avoids splitting table rows.
- In a background browser tab, motion animations are throttled, so screenshots can catch pages mid-fade. Wait a few seconds or focus the tab.
- Existing `Button` default size grew from 32px to 36px to match the old `.btn`.
