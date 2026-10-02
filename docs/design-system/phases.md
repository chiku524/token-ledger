# Rollout phases

One commit per phase (Phase 4 has four). Each phase must pass
`pnpm lint && pnpm typecheck && pnpm test && pnpm build` and look right in dark and
light before it is committed.

- [x] **0. Tooling, skills, docs** (committed)
- [x] **1. Foundation** — `feat: add motion provider and brand tokens`
  - shadcn init, `cn()`, `@custom-variant dark` and the Button already landed in PR #128
  - This phase adds `motion`, `MotionProvider` (mounted in the root layout), the
    `brand`, `link` and `success` tokens, and remaps shadcn `accent` to a neutral surface
  - No visual change
- [x] **2. Primitives and composites** — `feat: ui primitives, app composites, motion primitives`
  - `ui/*` (extend the existing `button.tsx` with a `brand` variant and brand sizing,
    and fold `SubmitButton` into the new set), `app/*`, `Logo`, motion primitives,
    small tests
- [x] **3. App shell** — `feat: restyle dashboard shell`
  - Sidebar, mobile Sheet nav, theme toggle, user menu, skeleton loading
- [x] **4a. Forms and shared components** — `record-forms`, `connector-form`, `period-form`, `example-banner`, `connection-tour` as Dialog
- [x] **4b. Overview pages** — dashboard, sources, entities, setup, guide, charts
- [x] **4c. Ledger pages** — ledger, approvals, reconciliation
- [x] **4d. Reporting and admin pages** — reports, consolidation, operations, audit, users, settings, error boundaries
- [ ] **5. Public pages** — `feat: restyle public pages`
  - Landing, sign-in, sign-up wizard, reset-password, verify-email
- [ ] **6. Print, cleanup, a11y** — `chore: print styles, remove legacy classes, docs`
  - `@media print` light styles, delete legacy classes, contrast and reduced-motion pass

Each phase: update `components.md`, tick the box here.
